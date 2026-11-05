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

type LedgerRowType = 'opening' | 'invoice' | 'payment' | 'closing';

type LedgerReferenceType =
  | 'VENDOR_INVOICE_SUMMARY'
  | 'VENDOR_VOUCHER'
  | 'MAINTENANCE_VOUCHER'
  | null;

type LedgerRow = {
  type: LedgerRowType;
  date: string | null;
  documentNo: string | null;
  particular: string;
  /** Detail columns kept for FE parity; null on transaction-based ledger */
  cash: number | null;
  hsdLtr: number | null;
  rate: number | null;
  hsdAmount: number | null;
  total: number | null;
  debit: number | null;
  credit: number | null;
  balance: number;
  entryType: EntryType | null;
  showInLedger: boolean | null;
  referenceType: LedgerReferenceType;
  referenceId: string | null;
  transactionId: string | null;
  tripId: string | null;
  tripCode: string | null;
};

/**
 * Vendor AP statement from `transactions` where `showInLedger = true`
 * on the vendor payable leaf:
 * - VENDOR_INVOICE_SUMMARY (LEDGER_ONLY, CR)
 * - VENDOR_VOUCHER_VENDOR / MAINTENANCE_VOUCHER_VENDOR (ACCOUNTING, DR)
 *
 * Daily purchases stay ACCOUNTING + showInLedger=false (not listed here).
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
    const rows: LedgerRow[] = [];

    rows.push({
      type: 'opening',
      date: dateFrom,
      documentNo: null,
      particular: 'OPENING BALANCE',
      cash: null,
      hsdLtr: null,
      rate: null,
      hsdAmount: null,
      total: null,
      debit: null,
      credit: null,
      balance: running,
      entryType: null,
      showInLedger: null,
      referenceType: null,
      referenceId: null,
      transactionId: null,
      tripId: null,
      tripCode: null,
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
      // Credit-normal AP: payable rises with CR, falls with DR.
      running = this.roundMoney(running + creditVal - debitVal);
      totals.debit += debitVal;
      totals.credit += creditVal;

      const mapped = this.mapReference(tx.referenceType);
      const doc = meta.get(this.metaKey(tx.referenceType, tx.referenceId));

      rows.push({
        type: mapped.rowType,
        date: this.toDateString(tx.transactionDate),
        documentNo: doc?.documentNo ?? null,
        particular:
          tx.description?.trim() ||
          doc?.particular ||
          mapped.defaultParticular,
        cash: null,
        hsdLtr: null,
        rate: null,
        hsdAmount: null,
        total: creditVal > 0 ? creditVal : debitVal > 0 ? debitVal : null,
        debit,
        credit,
        balance: running,
        entryType: tx.entryType ?? EntryType.ACCOUNTING,
        showInLedger: tx.showInLedger ?? true,
        referenceType: mapped.apiReferenceType,
        referenceId: tx.referenceId,
        transactionId: tx.id,
        tripId: null,
        tripCode: null,
      });
    }

    const closingBalance = running;

    rows.push({
      type: 'closing',
      date: asOf,
      documentNo: null,
      particular: 'CLOSING BALANCE',
      cash: null,
      hsdLtr: null,
      rate: null,
      hsdAmount: null,
      total: null,
      debit: null,
      credit: null,
      balance: closingBalance,
      entryType: null,
      showInLedger: null,
      referenceType: null,
      referenceId: null,
      transactionId: null,
      tripId: null,
      tripCode: null,
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
      filters: {
        dateFrom,
        asOf,
      },
      openingBalance: this.roundMoney(openingBalance),
      closingBalance: this.roundMoney(closingBalance),
      totals: {
        cash: 0,
        hsdLtr: 0,
        hsdAmount: 0,
        total: this.roundMoney(totals.credit),
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
      totals: {
        cash: 0,
        hsdLtr: 0,
        hsdAmount: 0,
        total: 0,
        debit: 0,
        credit: 0,
      },
      rows: [
        {
          type: 'opening' as const,
          date: dateFrom,
          documentNo: null,
          particular: 'OPENING BALANCE',
          cash: null,
          hsdLtr: null,
          rate: null,
          hsdAmount: null,
          total: null,
          debit: null,
          credit: null,
          balance: 0,
          entryType: null,
          showInLedger: null,
          referenceType: null,
          referenceId: null,
          transactionId: null,
          tripId: null,
          tripCode: null,
        },
        {
          type: 'closing' as const,
          date: asOf,
          documentNo: null,
          particular: 'CLOSING BALANCE',
          cash: null,
          hsdLtr: null,
          rate: null,
          hsdAmount: null,
          total: null,
          debit: null,
          credit: null,
          balance: 0,
          entryType: null,
          showInLedger: null,
          referenceType: null,
          referenceId: null,
          transactionId: null,
          tripId: null,
          tripCode: null,
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
      { documentNo: string | null; particular: string | null }
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
            documentNo: inv.invoiceNumber,
            particular:
              inv.description?.trim() ||
              `Vendor Invoice ${inv.invoiceNumber}`,
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
            documentNo: v.voucherNumber,
            particular:
              v.description?.trim() ||
              v.remarks?.trim() ||
              `Vendor Payment ${v.voucherNumber}`,
          },
        );
      }
    }

    if (maintenanceIds.length) {
      const vouchers = await this.maintenanceVoucherRepo.find({
        where: { id: In([...new Set(maintenanceIds)]) },
        relations: { purchaseOrder: true },
      });
      for (const v of vouchers) {
        map.set(
          this.metaKey(
            AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR,
            v.id,
          ),
          {
            documentNo: v.voucherNumber,
            particular:
              v.remarks?.trim() ||
              (v.purchaseOrder?.purchaseOrderNo
                ? `PO Payment ${v.purchaseOrder.purchaseOrderNo}`
                : `Maintenance Payment ${v.voucherNumber}`),
          },
        );
      }
    }

    return map;
  }

  private mapReference(referenceType: AccountTransactionReferenceType): {
    rowType: 'invoice' | 'payment';
    apiReferenceType: LedgerReferenceType;
    defaultParticular: string;
  } {
    if (
      referenceType === AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY
    ) {
      return {
        rowType: 'invoice',
        apiReferenceType: 'VENDOR_INVOICE_SUMMARY',
        defaultParticular: 'Vendor Invoice',
      };
    }
    if (
      referenceType ===
      AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR
    ) {
      return {
        rowType: 'payment',
        apiReferenceType: 'MAINTENANCE_VOUCHER',
        defaultParticular: 'Maintenance Payment',
      };
    }
    return {
      rowType: 'payment',
      apiReferenceType: 'VENDOR_VOUCHER',
      defaultParticular: 'Vendor Payment',
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
