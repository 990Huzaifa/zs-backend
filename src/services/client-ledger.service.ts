import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientLedgerQueryDto } from '../auth/dto/client-ledger.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { Client, ClientWithHeldTaxRate } from '../database/entities/client.entity';
import {
  ClientInvoice,
  ClientInvoiceItem,
  ClientInvoiceStatus,
} from '../database/entities/client-invoice.entity';
import { ClientVoucher } from '../database/entities/client-voucher.entity';
import {
  TripDowncountryLoad,
  TripUpcountryLoad,
} from '../database/entities/trip.entity';
import { PaymentMethod, VoucherStatus } from '../database/entities/voucher.entity';

type LedgerRowType = 'opening' | 'invoice' | 'payment' | 'closing';

type TaxAuthority = 'SRB' | 'PRA' | 'FBR' | 'OTHER';

type InvoiceTaxBreakup = {
  billExclSalesTax: number;
  salesTaxSrb: number;
  salesTaxPra: number;
  billInclSalesTax: number;
  whSrb: number;
  whPra: number;
  taxWht: number;
  salesTaxSrbRate: number | null;
  salesTaxPraRate: number | null;
  whSrbRate: number | null;
  whPraRate: number | null;
  taxWhtRate: number | null;
};

@Injectable()
export class ClientLedgerService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientInvoice)
    private readonly invoiceRepo: Repository<ClientInvoice>,
    @InjectRepository(ClientVoucher)
    private readonly voucherRepo: Repository<ClientVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  async getLedger(query: ClientLedgerQueryDto) {
    const asOf = query.asOf.slice(0, 10);
    const dateFrom = query.dateFrom?.slice(0, 10) ?? null;

    if (dateFrom && dateFrom > asOf) {
      throw new BadRequestException('dateFrom must be on or before asOf');
    }

    const client = await this.clientRepo.findOne({
      where: { id: query.clientId },
      relations: {
        saleTaxTypes: true,
        withHoldingTaxTypes: true,
      },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const withHeldBySaleTaxId = this.indexClientWithHeld(
      client.withHeldtaxRate,
    );

    const openingBalance = dateFrom
      ? await this.computeOpeningBalance(client.id, dateFrom)
      : 0;

    const [invoices, vouchers] = await Promise.all([
      this.loadInvoices(client.id, dateFrom, asOf),
      this.loadVouchers(client.id, dateFrom, asOf),
    ]);

    type MutableRow = {
      sortDate: string;
      sortKey: string;
      type: LedgerRowType;
      date: string;
      documentNo: string | null;
      particular: string;
      billExclSalesTax: number | null;
      salesTaxSrb: number | null;
      salesTaxPra: number | null;
      billInclSalesTax: number | null;
      whSrb: number | null;
      whPra: number | null;
      taxWht: number | null;
      debit: number | null;
      credit: number | null;
      referenceType: 'CLIENT_INVOICE' | 'CLIENT_VOUCHER' | null;
      referenceId: string | null;
    };

    const periodRows: MutableRow[] = [];

    for (const invoice of invoices) {
      const breakup = this.buildInvoiceBreakup(invoice);
      periodRows.push({
        sortDate: this.toDateString(invoice.invoiceDate),
        sortKey: `1-${invoice.createdAt.toISOString()}-${invoice.id}`,
        type: 'invoice',
        date: this.toDateString(invoice.invoiceDate),
        documentNo: invoice.invoiceNumber,
        particular: this.buildInvoiceParticular(invoice),
        billExclSalesTax: breakup.billExclSalesTax,
        salesTaxSrb: breakup.salesTaxSrb,
        salesTaxPra: breakup.salesTaxPra,
        billInclSalesTax: breakup.billInclSalesTax,
        whSrb: breakup.whSrb,
        whPra: breakup.whPra,
        taxWht: breakup.taxWht,
        debit: this.roundMoney(Number(invoice.netAmount)),
        credit: null,
        referenceType: 'CLIENT_INVOICE',
        referenceId: invoice.id,
      });
    }

    for (const voucher of vouchers) {
      const amount = this.roundMoney(Number(voucher.paymentAmount));
      periodRows.push({
        sortDate: this.toDateString(voucher.paymentDate),
        sortKey: `2-${voucher.createdAt.toISOString()}-${voucher.id}`,
        type: 'payment',
        date: this.toDateString(voucher.paymentDate),
        documentNo: voucher.voucherNumber,
        particular: this.buildPaymentParticular(voucher),
        billExclSalesTax: null,
        salesTaxSrb: null,
        salesTaxPra: null,
        billInclSalesTax: null,
        whSrb: null,
        whPra: null,
        taxWht: null,
        debit: null,
        credit: amount,
        referenceType: 'CLIENT_VOUCHER',
        referenceId: voucher.id,
      });
    }

    periodRows.sort((a, b) => {
      if (a.sortDate !== b.sortDate) return a.sortDate.localeCompare(b.sortDate);
      return a.sortKey.localeCompare(b.sortKey);
    });

    let running = this.roundMoney(openingBalance);
    const rows: Array<{
      type: LedgerRowType;
      date: string | null;
      documentNo: string | null;
      particular: string;
      billExclSalesTax: number | null;
      salesTaxSrb: number | null;
      salesTaxPra: number | null;
      billInclSalesTax: number | null;
      whSrb: number | null;
      whPra: number | null;
      taxWht: number | null;
      debit: number | null;
      credit: number | null;
      balance: number;
      referenceType: 'CLIENT_INVOICE' | 'CLIENT_VOUCHER' | null;
      referenceId: string | null;
    }> = [];

    rows.push({
      type: 'opening',
      date: dateFrom,
      documentNo: null,
      particular: 'OPENING BALANCE',
      billExclSalesTax: null,
      salesTaxSrb: null,
      salesTaxPra: null,
      billInclSalesTax: null,
      whSrb: null,
      whPra: null,
      taxWht: null,
      debit: null,
      credit: null,
      balance: running,
      referenceType: null,
      referenceId: null,
    });

    const totals = {
      billExclSalesTax: 0,
      salesTaxSrb: 0,
      salesTaxPra: 0,
      billInclSalesTax: 0,
      whSrb: 0,
      whPra: 0,
      taxWht: 0,
      debit: 0,
      credit: 0,
    };

    for (const row of periodRows) {
      const debit = row.debit ?? 0;
      const credit = row.credit ?? 0;
      running = this.roundMoney(running + debit - credit);

      if (row.billExclSalesTax != null) {
        totals.billExclSalesTax += row.billExclSalesTax;
      }
      if (row.salesTaxSrb != null) totals.salesTaxSrb += row.salesTaxSrb;
      if (row.salesTaxPra != null) totals.salesTaxPra += row.salesTaxPra;
      if (row.billInclSalesTax != null) {
        totals.billInclSalesTax += row.billInclSalesTax;
      }
      if (row.whSrb != null) totals.whSrb += row.whSrb;
      if (row.whPra != null) totals.whPra += row.whPra;
      if (row.taxWht != null) totals.taxWht += row.taxWht;
      totals.debit += debit;
      totals.credit += credit;

      rows.push({
        type: row.type,
        date: row.date,
        documentNo: row.documentNo,
        particular: row.particular,
        billExclSalesTax: row.billExclSalesTax,
        salesTaxSrb: row.salesTaxSrb,
        salesTaxPra: row.salesTaxPra,
        billInclSalesTax: row.billInclSalesTax,
        whSrb: row.whSrb,
        whPra: row.whPra,
        taxWht: row.taxWht,
        debit: row.debit,
        credit: row.credit,
        balance: running,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
      });
    }

    const closingBalance = running;
    rows.push({
      type: 'closing',
      date: asOf,
      documentNo: null,
      particular: 'CLOSING BALANCE',
      billExclSalesTax: null,
      salesTaxSrb: null,
      salesTaxPra: null,
      billInclSalesTax: null,
      whSrb: null,
      whPra: null,
      taxWht: null,
      debit: null,
      credit: null,
      balance: closingBalance,
      referenceType: null,
      referenceId: null,
    });

    const partyAccount = await this.resolvePartyAccount(client.companyName);
    const columnRates = this.resolveColumnRates(
      client,
      invoices,
      withHeldBySaleTaxId,
    );

    return {
      currency: 'PKR',
      client: {
        id: client.id,
        companyName: client.companyName,
        ntn: client.ntn,
        saleTaxNo: client.saleTaxNo,
      },
      partyAccount: partyAccount
        ? {
            id: partyAccount.id,
            code: partyAccount.code,
            name: partyAccount.name,
          }
        : null,
      filters: {
        dateFrom,
        asOf,
      },
      columnRates,
      openingBalance: this.roundMoney(openingBalance),
      closingBalance: this.roundMoney(closingBalance),
      totals: {
        billExclSalesTax: this.roundMoney(totals.billExclSalesTax),
        salesTaxSrb: this.roundMoney(totals.salesTaxSrb),
        salesTaxPra: this.roundMoney(totals.salesTaxPra),
        billInclSalesTax: this.roundMoney(totals.billInclSalesTax),
        whSrb: this.roundMoney(totals.whSrb),
        whPra: this.roundMoney(totals.whPra),
        taxWht: this.roundMoney(totals.taxWht),
        debit: this.roundMoney(totals.debit),
        credit: this.roundMoney(totals.credit),
      },
      rows,
    };
  }

  private async computeOpeningBalance(
    clientId: string,
    dateFrom: string,
  ): Promise<number> {
    const [invoiceGross, paymentTotal] = await Promise.all([
      this.invoiceRepo
        .createQueryBuilder('inv')
        .select(
          'COALESCE(SUM(CAST(inv.netAmount AS decimal)), 0)',
          'total',
        )
        .where('inv.clientId = :clientId', { clientId })
        .andWhere('inv.invoiceStatus != :cancelled', {
          cancelled: ClientInvoiceStatus.CANCELLED,
        })
        .andWhere('inv.invoiceDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
      this.voucherRepo
        .createQueryBuilder('v')
        .select('COALESCE(SUM(v.paymentAmount), 0)', 'total')
        .where('v.clientId = :clientId', { clientId })
        .andWhere('v.status = :status', { status: VoucherStatus.PAID })
        .andWhere('v.paymentDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
    ]);

    const debit = Number(invoiceGross?.total) || 0;
    const credit = Number(paymentTotal?.total) || 0;
    return this.roundMoney(debit - credit);
  }

  private async loadInvoices(
    clientId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<ClientInvoice[]> {
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.items', 'item')
      .leftJoinAndSelect('item.saleTaxRule', 'saleTaxRule')
      .leftJoinAndSelect('item.withholdingTaxRule', 'withholdingTaxRule')
      .leftJoinAndSelect('item.trip', 'trip')
      .leftJoinAndSelect('trip.upcountryLoads', 'upLoad')
      .leftJoinAndSelect('trip.downcountryLoads', 'downLoad')
      .leftJoinAndSelect('upLoad.bilty', 'upBilty')
      .leftJoinAndSelect('downLoad.bilty', 'downBilty')
      .leftJoinAndSelect('upBilty.loadings', 'upLoading')
      .leftJoinAndSelect('upLoading.pickupLocation', 'upPickup')
      .leftJoinAndSelect('upBilty.offLoadings', 'upOff')
      .leftJoinAndSelect('upOff.dropoffLocation', 'upDrop')
      .leftJoinAndSelect('downBilty.loadings', 'downLoading')
      .leftJoinAndSelect('downLoading.pickupLocation', 'downPickup')
      .leftJoinAndSelect('downBilty.offLoadings', 'downOff')
      .leftJoinAndSelect('downOff.dropoffLocation', 'downDrop')
      .where('inv.clientId = :clientId', { clientId })
      .andWhere('inv.invoiceStatus != :cancelled', {
        cancelled: ClientInvoiceStatus.CANCELLED,
      })
      .andWhere('inv.invoiceDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('inv.invoiceDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('inv.invoiceDate', 'ASC')
      .addOrderBy('inv.createdAt', 'ASC')
      .getMany();
  }

  private async loadVouchers(
    clientId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<ClientVoucher[]> {
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.clientId = :clientId', { clientId })
      .andWhere('v.status = :status', { status: VoucherStatus.PAID })
      .andWhere('v.paymentDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('v.paymentDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('v.paymentDate', 'ASC')
      .addOrderBy('v.createdAt', 'ASC')
      .getMany();
  }

  private buildInvoiceBreakup(invoice: ClientInvoice): InvoiceTaxBreakup {
    let billExcl = 0;
    let salesTaxSrb = 0;
    let salesTaxPra = 0;
    let whSrb = 0;
    let whPra = 0;
    let taxWht = 0;

    let salesTaxSrbRate: number | null = null;
    let salesTaxPraRate: number | null = null;
    let whSrbRate: number | null = null;
    let whPraRate: number | null = null;
    let taxWhtRate: number | null = null;

    for (const item of invoice.items ?? []) {
      const freight = this.roundMoney(Number(item.freightAmount));
      const salesTax = this.roundMoney(Number(item.salesTaxAmount));
      const wht = this.roundMoney(Number(item.withholdingTaxAmount));
      const whOnSalesTax = this.roundMoney(
        Number(item.saleTaxWithheldAmount ?? 0),
      );
      billExcl += freight;
      taxWht += wht;

      const auth = this.extractAuthority(
        item.saleTaxRule?.authority,
        item.saleTaxRule?.code,
      );
      const saleRate = this.toRateNumber(item.saleTaxRate);
      const heldPct = this.toRateNumber(item.saleTaxWithheldPercent);

      if (auth === 'PRA') {
        salesTaxPra += salesTax;
        whPra += whOnSalesTax;
        if (salesTaxPraRate == null && saleRate != null) {
          salesTaxPraRate = saleRate;
        }
        if (whPraRate == null && heldPct != null && heldPct > 0) {
          whPraRate = heldPct;
        }
      } else {
        // Default / SRB / FBR / OTHER → SRB column (common default in UI)
        salesTaxSrb += salesTax;
        whSrb += whOnSalesTax;
        if (salesTaxSrbRate == null && saleRate != null) {
          salesTaxSrbRate = saleRate;
        }
        if (whSrbRate == null && heldPct != null && heldPct > 0) {
          whSrbRate = heldPct;
        }
      }

      const itemWhtRate = this.toRateNumber(item.withholdingTaxRate);
      if (taxWhtRate == null && itemWhtRate != null) taxWhtRate = itemWhtRate;
    }

    // Fallback to header totals if items missing
    if (!(invoice.items?.length)) {
      billExcl = this.roundMoney(Number(invoice.freightAmount));
      const headerSt = this.roundMoney(Number(invoice.salesTaxAmount));
      salesTaxSrb = headerSt;
      taxWht = this.roundMoney(Number(invoice.withHoldingTaxAmount));
      whSrb = this.roundMoney(Number(invoice.saleTaxWithheldAmount ?? 0));
    }

    const billIncl = this.roundMoney(billExcl + salesTaxSrb + salesTaxPra);

    return {
      billExclSalesTax: this.roundMoney(billExcl),
      salesTaxSrb: this.roundMoney(salesTaxSrb),
      salesTaxPra: this.roundMoney(salesTaxPra),
      billInclSalesTax: billIncl,
      whSrb: this.roundMoney(whSrb),
      whPra: this.roundMoney(whPra),
      taxWht: this.roundMoney(taxWht),
      salesTaxSrbRate,
      salesTaxPraRate,
      whSrbRate,
      whPraRate,
      taxWhtRate,
    };
  }

  private resolveColumnRates(
    client: Client,
    invoices: ClientInvoice[],
    withHeldBySaleTaxId: Map<string, number>,
  ) {
    let salesTaxSrbRate: number | null = null;
    let salesTaxPraRate: number | null = null;
    let whSrbRate: number | null = null;
    let whPraRate: number | null = null;
    let taxWhtRate: number | null = null;

    // Prefer rates snapshot on period invoices
    for (const invoice of invoices) {
      const b = this.buildInvoiceBreakup(invoice);
      if (salesTaxSrbRate == null) salesTaxSrbRate = b.salesTaxSrbRate;
      if (salesTaxPraRate == null) salesTaxPraRate = b.salesTaxPraRate;
      if (whSrbRate == null) whSrbRate = b.whSrbRate;
      if (whPraRate == null) whPraRate = b.whPraRate;
      if (taxWhtRate == null) taxWhtRate = b.taxWhtRate;
    }

    for (const rule of client.saleTaxTypes ?? []) {
      const auth = this.extractAuthority(rule.authority, rule.code);
      const rate = this.toRateNumber(rule.rate);
      const held = withHeldBySaleTaxId.get(rule.id) ?? null;
      if (auth === 'PRA') {
        if (salesTaxPraRate == null) salesTaxPraRate = rate;
        if (whPraRate == null) whPraRate = held;
      } else {
        if (salesTaxSrbRate == null) salesTaxSrbRate = rate;
        if (whSrbRate == null) whSrbRate = held;
      }
    }

    for (const rule of client.withHoldingTaxTypes ?? []) {
      if (taxWhtRate == null) {
        taxWhtRate = this.toRateNumber(rule.rate);
      }
    }

    return {
      salesTaxSrbRate,
      salesTaxPraRate,
      whSrbRate,
      whPraRate,
      taxWhtRate,
    };
  }

  private buildInvoiceParticular(invoice: ClientInvoice): string {
    if (invoice.note?.trim()) return invoice.note.trim();

    const routes = new Set<string>();
    for (const item of invoice.items ?? []) {
      const loads = this.loadsForClient(item.trip, invoice.clientId);
      const primary = loads[0];
      const from = this.resolveLoadingArea(primary);
      const to = this.resolveUnloadingArea(primary);
      if (from && to) {
        routes.add(`${from} TO ${to}`.toUpperCase());
      } else if (from || to) {
        routes.add((from || to).toUpperCase());
      }
    }

    if (routes.size) return [...routes].join(' / ');
    return 'Sales Tax Invoice';
  }

  private buildPaymentParticular(voucher: ClientVoucher): string {
    if (voucher.remarks?.trim()) return voucher.remarks.trim();

    const method = voucher.paymentMethod;
    if (method === PaymentMethod.CHEQUE && voucher.chequeNumber?.trim()) {
      return `CHQ NO ${voucher.chequeNumber.trim()}`;
    }
    if (method === PaymentMethod.TRANSFER) return 'BANK TRANSFER';
    if (method === PaymentMethod.ONLINE) return 'ONLINE PAYMENT';
    if (method === PaymentMethod.CASH) return 'CASH RECEIPT';
    return 'Client Receipt';
  }

  private loadsForClient(
    trip: ClientInvoiceItem['trip'] | undefined,
    clientId: string,
  ): Array<TripUpcountryLoad | TripDowncountryLoad> {
    if (!trip) return [];
    const all = [
      ...(trip.upcountryLoads ?? []),
      ...(trip.downcountryLoads ?? []),
    ];
    const matched = all.filter((l) => l.clientId === clientId);
    return matched.length ? matched : all;
  }

  private resolveLoadingArea(
    load?: TripUpcountryLoad | TripDowncountryLoad | null,
  ): string {
    if (!load) return '';
    const fromBilty = load.bilty?.loadings?.[0]?.pickupLocation?.name?.trim();
    if (fromBilty) return fromBilty;
    return (load.address ?? '').trim();
  }

  private resolveUnloadingArea(
    load?: TripUpcountryLoad | TripDowncountryLoad | null,
  ): string {
    if (!load) return '';
    const fromBilty =
      load.bilty?.offLoadings?.[0]?.dropoffLocation?.name?.trim();
    if (fromBilty) return fromBilty;
    return (load.toDetails ?? '').trim();
  }

  private async resolvePartyAccount(companyName: string) {
    return this.coaRepo.findOne({
      where: {
        parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
        name: companyName.trim(),
        accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
      },
    });
  }

  private indexClientWithHeld(
    value: ClientWithHeldTaxRate[] | null | undefined,
  ): Map<string, number> {
    const map = new Map<string, number>();
    if (!value?.length) return map;
    for (const row of value) {
      if (!row?.saleTaxTypeId || row.percent == null) continue;
      const n = Number(row.percent);
      if (Number.isFinite(n)) map.set(row.saleTaxTypeId, n);
    }
    return map;
  }

  private extractAuthority(
    authority?: string | null,
    code?: string | null,
  ): TaxAuthority {
    const fromAuth = authority?.match(/\b(SRB|PRA|FBR)\b/i)?.[1];
    if (fromAuth) return fromAuth.toUpperCase() as TaxAuthority;
    const fromCode = code?.match(/\b(SRB|PRA|FBR)\b/i)?.[0];
    if (fromCode) return fromCode.toUpperCase() as TaxAuthority;
    return 'SRB';
  }

  private toRateNumber(value: string | number | null | undefined): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toDateString(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
