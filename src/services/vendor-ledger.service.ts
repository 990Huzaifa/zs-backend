import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VendorLedgerQueryDto } from '../auth/dto/vendor-ledger.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { MaintenanceVoucher } from '../database/entities/maintenance/maintenance-voucher.entity';
import {
  AccountTransactionReferenceType,
  EntryType,
  Transaction,
} from '../database/entities/transaction.entity';
import { VendorInvoice } from '../database/entities/vendor/vendor-invoice.entity';
import { Vendor } from '../database/entities/vendor/vendor.entity';
import { VendorVoucher } from '../database/entities/vendor/vendor-voucher.entity';

/**
 * Vendor ledger statement — matches docs/transaction.md §3:
 *
 * Date | Reference | Particulars | Debit | Credit | Running billed balance
 *
 * Data: transactions on vendor payable leaf with showInLedger=true
 * - Invoice summary: LEDGER_ONLY / CR
 * - Payment party leg: ACCOUNTING / DR
 */
@Injectable()
export class VendorLedgerService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(VendorInvoice)
    private readonly invoiceRepo: Repository<VendorInvoice>,
    @InjectRepository(VendorVoucher)
    private readonly voucherRepo: Repository<VendorVoucher>,
    @InjectRepository(MaintenanceVoucher)
    private readonly maintenanceVoucherRepo: Repository<MaintenanceVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  async getLedger(query: VendorLedgerQueryDto) {
    const asOf = query.asOf.slice(0, 10);
    const dateFrom = query.dateFrom?.slice(0, 10) ?? null;

    if (dateFrom && dateFrom > asOf) {
      throw new BadRequestException('dateFrom must be on or before asOf');
    }

    const vendor = await this.vendorRepo.findOne({
      where: { id: query.vendorId },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const displayName =
      vendor.vendorName?.trim() || vendor.ownerName.trim();
    const partyAccount = await this.resolvePartyAccount(displayName);

    if (!partyAccount) {
      return this.emptyLedger(vendor, null, dateFrom, asOf);
    }

    const openingBalance = dateFrom
      ? await this.computeOpeningBalance(partyAccount.id, dateFrom)
      : 0;

    const periodTxs = await this.loadLedgerTransactions(
      partyAccount.id,
      dateFrom,
      asOf,
    );
    const meta = await this.loadReferenceMeta(periodTxs);

    let running = this.roundMoney(openingBalance);
    const rows: Array<{
      type: 'opening' | 'invoice' | 'payment' | 'closing';
      date: string | null;
      reference: string | null;
      particulars: string;
      debit: number | null;
      credit: number | null;
      balance: number;
      entryType: EntryType | null;
      showInLedger: boolean | null;
      referenceType: string | null;
      referenceId: string | null;
      transactionId: string | null;
    }> = [];

    rows.push({
      type: 'opening',
      date: dateFrom,
      reference: null,
      particulars: 'OPENING BALANCE',
      debit: null,
      credit: null,
      balance: running,
      entryType: null,
      showInLedger: null,
      referenceType: null,
      referenceId: null,
      transactionId: null,
    });

    const totals = { debit: 0, credit: 0 };

    for (const tx of periodTxs) {
      const debit =
        tx.debitAmount != null ? this.roundMoney(Number(tx.debitAmount)) : null;
      const credit =
        tx.creditAmount != null
          ? this.roundMoney(Number(tx.creditAmount))
          : null;
      const debitVal = debit ?? 0;
      const creditVal = credit ?? 0;
      running = this.roundMoney(running + creditVal - debitVal);
      totals.debit += debitVal;
      totals.credit += creditVal;

      const mapped = this.mapReference(tx.referenceType);
      const doc = meta.get(this.metaKey(tx.referenceType, tx.referenceId));

      rows.push({
        type: mapped.rowType,
        date: this.toDateString(tx.transactionDate),
        reference: doc?.reference ?? null,
        particulars:
          doc?.particulars ||
          tx.description?.trim() ||
          mapped.defaultParticulars,
        debit: debitVal > 0 ? debitVal : null,
        credit: creditVal > 0 ? creditVal : null,
        balance: running,
        entryType: tx.entryType ?? EntryType.ACCOUNTING,
        showInLedger: tx.showInLedger ?? true,
        referenceType: mapped.apiReferenceType,
        referenceId: tx.referenceId,
        transactionId: tx.id,
      });
    }

    const closingBalance = running;

    rows.push({
      type: 'closing',
      date: asOf,
      reference: null,
      particulars: 'CLOSING BALANCE',
      debit: null,
      credit: null,
      balance: closingBalance,
      entryType: null,
      showInLedger: null,
      referenceType: null,
      referenceId: null,
      transactionId: null,
    });

    return {
      currency: 'PKR',
      vendor: {
        id: vendor.id,
        vendorName: vendor.vendorName ?? null,
        ownerName: vendor.ownerName,
        email: vendor.email ?? null,
        phone: vendor.phone ?? null,
        taxStatus: vendor.taxStatus,
      },
      partyAccount: {
        id: partyAccount.id,
        code: partyAccount.code,
        name: partyAccount.name,
      },
      filters: { dateFrom, asOf },
      openingBalance: this.roundMoney(openingBalance),
      closingBalance: this.roundMoney(closingBalance),
      totals: {
        debit: this.roundMoney(totals.debit),
        credit: this.roundMoney(totals.credit),
      },
      rows,
    };
  }

  private emptyLedger(
    vendor: Vendor,
    partyAccount: ChartOfAccount | null,
    dateFrom: string | null,
    asOf: string,
  ) {
    return {
      currency: 'PKR',
      vendor: {
        id: vendor.id,
        vendorName: vendor.vendorName ?? null,
        ownerName: vendor.ownerName,
        email: vendor.email ?? null,
        phone: vendor.phone ?? null,
        taxStatus: vendor.taxStatus,
      },
      partyAccount: partyAccount
        ? {
            id: partyAccount.id,
            code: partyAccount.code,
            name: partyAccount.name,
          }
        : null,
      filters: { dateFrom, asOf },
      openingBalance: 0,
      closingBalance: 0,
      totals: { debit: 0, credit: 0 },
      rows: [
        {
          type: 'opening' as const,
          date: dateFrom,
          reference: null,
          particulars: 'OPENING BALANCE',
          debit: null,
          credit: null,
          balance: 0,
          entryType: null,
          showInLedger: null,
          referenceType: null,
          referenceId: null,
          transactionId: null,
        },
        {
          type: 'closing' as const,
          date: asOf,
          reference: null,
          particulars: 'CLOSING BALANCE',
          debit: null,
          credit: null,
          balance: 0,
          entryType: null,
          showInLedger: null,
          referenceType: null,
          referenceId: null,
          transactionId: null,
        },
      ],
    };
  }

  private async computeOpeningBalance(
    chartOfAccountId: string,
    dateFrom: string,
  ): Promise<number> {
    const raw = await this.transactionRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.creditAmount), 0)', 'credit')
      .addSelect('COALESCE(SUM(tx.debitAmount), 0)', 'debit')
      .where('tx.chartOfAccountId = :chartOfAccountId', { chartOfAccountId })
      .andWhere('tx.showInLedger = true')
      .andWhere('tx.transactionDate < :dateFrom', { dateFrom })
      .getRawOne<{ credit: string | number; debit: string | number }>();

    return this.roundMoney(
      (Number(raw?.credit) || 0) - (Number(raw?.debit) || 0),
    );
  }

  private async loadLedgerTransactions(
    chartOfAccountId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<Transaction[]> {
    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.chartOfAccountId = :chartOfAccountId', { chartOfAccountId })
      .andWhere('tx.showInLedger = true')
      .andWhere('tx.transactionDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('tx.transactionDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('tx.transactionDate', 'ASC')
      .addOrderBy('tx.createdAt', 'ASC')
      .getMany();
  }

  private async loadReferenceMeta(txs: Transaction[]) {
    const invoiceIds: string[] = [];
    const voucherIds: string[] = [];
    const maintenanceIds: string[] = [];

    for (const tx of txs) {
      if (!tx.referenceId) continue;
      if (
        tx.referenceType ===
        AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY
      ) {
        invoiceIds.push(tx.referenceId);
      } else if (
        tx.referenceType === AccountTransactionReferenceType.VENDOR_VOUCHER_VENDOR
      ) {
        voucherIds.push(tx.referenceId);
      } else if (
        tx.referenceType ===
        AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR
      ) {
        maintenanceIds.push(tx.referenceId);
      }
    }

    const map = new Map<
      string,
      { reference: string; particulars: string }
    >();

    if (invoiceIds.length) {
      const invoices = await this.invoiceRepo.find({
        where: { id: In([...new Set(invoiceIds)]) },
      });
      for (const inv of invoices) {
        map.set(
          this.metaKey(
            AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY,
            inv.id,
          ),
          {
            reference: inv.invoiceNumber,
            particulars: 'Vendor Invoice',
          },
        );
      }
    }

    if (voucherIds.length) {
      const vouchers = await this.voucherRepo.find({
        where: { id: In([...new Set(voucherIds)]) },
      });
      for (const v of vouchers) {
        map.set(
          this.metaKey(
            AccountTransactionReferenceType.VENDOR_VOUCHER_VENDOR,
            v.id,
          ),
          {
            reference: v.voucherNumber,
            particulars: 'Vendor Payment',
          },
        );
      }
    }

    if (maintenanceIds.length) {
      const vouchers = await this.maintenanceVoucherRepo.find({
        where: { id: In([...new Set(maintenanceIds)]) },
      });
      for (const v of vouchers) {
        map.set(
          this.metaKey(
            AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR,
            v.id,
          ),
          {
            reference: v.voucherNumber,
            particulars: 'Vendor Payment',
          },
        );
      }
    }

    return map;
  }

  private mapReference(referenceType: AccountTransactionReferenceType): {
    rowType: 'invoice' | 'payment';
    apiReferenceType: string;
    defaultParticulars: string;
  } {
    if (
      referenceType === AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY
    ) {
      return {
        rowType: 'invoice',
        apiReferenceType: 'VENDOR_INVOICE_SUMMARY',
        defaultParticulars: 'Vendor Invoice',
      };
    }
    if (
      referenceType ===
      AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR
    ) {
      return {
        rowType: 'payment',
        apiReferenceType: 'MAINTENANCE_VOUCHER',
        defaultParticulars: 'Vendor Payment',
      };
    }
    return {
      rowType: 'payment',
      apiReferenceType: 'VENDOR_VOUCHER',
      defaultParticulars: 'Vendor Payment',
    };
  }

  private metaKey(
    referenceType: AccountTransactionReferenceType | string | null,
    referenceId: string | null,
  ) {
    return `${referenceType ?? ''}:${referenceId ?? ''}`;
  }

  private async resolvePartyAccount(displayName: string) {
    const name = displayName.trim();
    if (!name) return null;
    return this.coaRepo.findOne({
      where: {
        parentCode: COA_PARENT_CODES.VENDOR_PAYABLES,
        name,
        accountKind: ChartOfAccountKind.PARTY_PAYABLE,
      },
    });
  }

  private toDateString(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
