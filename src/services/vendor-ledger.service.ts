import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorLedgerQueryDto } from '../auth/dto/vendor-ledger.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { MaintenanceVoucher } from '../database/entities/maintenance/maintenance-voucher.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../database/entities/maintenance/purchase-order.entity';
import {
  TripExpenseStatus,
  TripPumpExpense,
} from '../database/entities/trip.entity';
import { Vendor } from '../database/entities/vendor.entity';
import { VendorVoucher } from '../database/entities/vendor-voucher.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../database/entities/voucher.entity';

type LedgerRowType = 'opening' | 'expense' | 'purchase' | 'payment' | 'closing';

type LedgerRow = {
  type: LedgerRowType;
  date: string | null;
  documentNo: string | null;
  particular: string;
  cash: number | null;
  hsdLtr: number | null;
  rate: number | null;
  hsdAmount: number | null;
  total: number | null;
  debit: number | null;
  credit: number | null;
  balance: number;
  referenceType:
    | 'TRIP_PUMP_EXPENSE'
    | 'PURCHASE_ORDER'
    | 'VENDOR_VOUCHER'
    | 'MAINTENANCE_VOUCHER'
    | null;
  referenceId: string | null;
  tripId: string | null;
  tripCode: string | null;
};

@Injectable()
export class VendorLedgerService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(TripPumpExpense)
    private readonly pumpExpenseRepo: Repository<TripPumpExpense>,
    @InjectRepository(VendorVoucher)
    private readonly voucherRepo: Repository<VendorVoucher>,
    @InjectRepository(MaintenanceVoucher)
    private readonly maintenanceVoucherRepo: Repository<MaintenanceVoucher>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepo: Repository<PurchaseOrder>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  /**
   * Vendor AP statement — trip pump expenses + approved POs (credit)
   * + paid vouchers (debit). Balance is credit-normal: opening + CR − DR.
   */
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

    const openingBalance = dateFrom
      ? await this.computeOpeningBalance(vendor.id, dateFrom)
      : 0;

    const [expenses, purchaseOrders, vouchers, maintenanceVouchers] =
      await Promise.all([
        this.loadPumpExpenses(vendor.id, dateFrom, asOf),
        this.loadPurchaseOrders(vendor.id, dateFrom, asOf),
        this.loadVouchers(vendor.id, dateFrom, asOf),
        this.loadMaintenanceVouchers(vendor.id, dateFrom, asOf),
      ]);

    type MutableRow = Omit<LedgerRow, 'balance'> & {
      sortDate: string;
      sortKey: string;
    };

    const periodRows: MutableRow[] = [];

    for (const expense of expenses) {
      const cash = this.roundMoney(Number(expense.cashAmount) || 0);
      const hsdLtr = this.roundQty(Number(expense.quantity) || 0);
      const rate = this.roundMoney(Number(expense.rate) || 0);
      const hsdAmount = this.roundMoney(Number(expense.amount) || 0);
      const total = this.roundMoney(
        Number(expense.totalAmount) || cash + hsdAmount,
      );
      const expenseDate = this.toDateString(expense.expenseDate);
      // Payable credit: total (cash-only or fuel+cash), matching trip ledger post.
      const credit = total > 0 ? total : hsdAmount;

      periodRows.push({
        sortDate: expenseDate,
        sortKey: `1-${expense.createdAt.toISOString()}-${expense.id}`,
        type: 'expense',
        date: expenseDate,
        documentNo: expense.voucherNumber ?? null,
        particular: this.buildExpenseParticular(expense),
        cash,
        hsdLtr,
        rate,
        hsdAmount,
        total,
        debit: null,
        credit,
        referenceType: 'TRIP_PUMP_EXPENSE',
        referenceId: expense.id,
        tripId: expense.tripId ?? null,
        tripCode: expense.trip?.tripCode ?? null,
      });
    }

    for (const po of purchaseOrders) {
      const amount = this.roundMoney(Number(po.grandTotal));
      if (amount <= 0) continue;
      const orderDate = this.toDateString(po.orderDate);
      periodRows.push({
        sortDate: orderDate,
        sortKey: `1.5-${po.createdAt.toISOString()}-${po.id}`,
        type: 'purchase',
        date: orderDate,
        documentNo: po.purchaseOrderNo,
        particular: this.buildPurchaseOrderParticular(po),
        cash: null,
        hsdLtr: null,
        rate: null,
        hsdAmount: null,
        total: amount,
        debit: null,
        credit: amount,
        referenceType: 'PURCHASE_ORDER',
        referenceId: po.id,
        tripId: null,
        tripCode: null,
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
        cash: null,
        hsdLtr: null,
        rate: null,
        hsdAmount: null,
        total: null,
        debit: amount,
        credit: null,
        referenceType: 'VENDOR_VOUCHER',
        referenceId: voucher.id,
        tripId: null,
        tripCode: null,
      });
    }

    for (const voucher of maintenanceVouchers) {
      const amount = this.roundMoney(Number(voucher.paymentAmount));
      periodRows.push({
        sortDate: this.toDateString(voucher.paymentDate),
        sortKey: `2.5-${voucher.createdAt.toISOString()}-${voucher.id}`,
        type: 'payment',
        date: this.toDateString(voucher.paymentDate),
        documentNo: voucher.voucherNumber,
        particular: this.buildMaintenancePaymentParticular(voucher),
        cash: null,
        hsdLtr: null,
        rate: null,
        hsdAmount: null,
        total: null,
        debit: amount,
        credit: null,
        referenceType: 'MAINTENANCE_VOUCHER',
        referenceId: voucher.id,
        tripId: null,
        tripCode: null,
      });
    }

    periodRows.sort((a, b) => {
      if (a.sortDate !== b.sortDate) return a.sortDate.localeCompare(b.sortDate);
      return a.sortKey.localeCompare(b.sortKey);
    });

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
      referenceType: null,
      referenceId: null,
      tripId: null,
      tripCode: null,
    });

    const totals = {
      cash: 0,
      hsdLtr: 0,
      hsdAmount: 0,
      total: 0,
      debit: 0,
      credit: 0,
    };

    for (const row of periodRows) {
      const debit = row.debit ?? 0;
      const credit = row.credit ?? 0;
      // Credit-normal AP: payable rises with CR, falls with DR.
      running = this.roundMoney(running + credit - debit);

      if (row.cash != null) totals.cash += row.cash;
      if (row.hsdLtr != null) totals.hsdLtr += row.hsdLtr;
      if (row.hsdAmount != null) totals.hsdAmount += row.hsdAmount;
      if (row.total != null) totals.total += row.total;
      totals.debit += debit;
      totals.credit += credit;

      rows.push({
        type: row.type,
        date: row.date,
        documentNo: row.documentNo,
        particular: row.particular,
        cash: row.cash,
        hsdLtr: row.hsdLtr,
        rate: row.rate,
        hsdAmount: row.hsdAmount,
        total: row.total,
        debit: row.debit,
        credit: row.credit,
        balance: running,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        tripId: row.tripId,
        tripCode: row.tripCode,
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
      referenceType: null,
      referenceId: null,
      tripId: null,
      tripCode: null,
    });

    const displayName =
      vendor.vendorName?.trim() || vendor.ownerName.trim();
    const partyAccount = await this.resolvePartyAccount(displayName);

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
      filters: {
        dateFrom,
        asOf,
      },
      openingBalance: this.roundMoney(openingBalance),
      closingBalance: this.roundMoney(closingBalance),
      totals: {
        cash: this.roundMoney(totals.cash),
        hsdLtr: this.roundQty(totals.hsdLtr),
        hsdAmount: this.roundMoney(totals.hsdAmount),
        total: this.roundMoney(totals.total),
        debit: this.roundMoney(totals.debit),
        credit: this.roundMoney(totals.credit),
      },
      rows,
    };
  }

  private async computeOpeningBalance(
    vendorId: string,
    dateFrom: string,
  ): Promise<number> {
    const [expenseCredit, poCredit, paymentDebit, mvPaymentDebit] =
      await Promise.all([
      this.pumpExpenseRepo
        .createQueryBuilder('e')
        .select(
          `COALESCE(SUM(
            CASE
              WHEN COALESCE(e.totalAmount, 0) > 0 THEN e.totalAmount
              ELSE COALESCE(e.amount, 0) + COALESCE(e.cashAmount, 0)
            END
          ), 0)`,
          'total',
        )
        .where('e.vendorId = :vendorId', { vendorId })
        .andWhere('e.status = :status', { status: TripExpenseStatus.PAID })
        .andWhere('e.expenseDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
      this.purchaseOrderRepo
        .createQueryBuilder('po')
        .select('COALESCE(SUM(po.grandTotal), 0)', 'total')
        .where('po.vendorId = :vendorId', { vendorId })
        .andWhere('po.status = :status', {
          status: PurchaseOrderStatus.APPROVED,
        })
        .andWhere('po.orderDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
      this.voucherRepo
        .createQueryBuilder('v')
        .select('COALESCE(SUM(v.paymentAmount), 0)', 'total')
        .where('v.vendorId = :vendorId', { vendorId })
        .andWhere('v.status = :status', { status: VoucherStatus.PAID })
        .andWhere('v.paymentDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
      this.maintenanceVoucherRepo
        .createQueryBuilder('mv')
        .select('COALESCE(SUM(mv.paymentAmount), 0)', 'total')
        .where('mv.vendorId = :vendorId', { vendorId })
        .andWhere('mv.status = :status', { status: VoucherStatus.PAID })
        .andWhere('mv.paymentDate < :dateFrom', { dateFrom })
        .getRawOne<{ total: string | number }>(),
    ]);

    const credit =
      (Number(expenseCredit?.total) || 0) + (Number(poCredit?.total) || 0);
    const debit =
      (Number(paymentDebit?.total) || 0) +
      (Number(mvPaymentDebit?.total) || 0);
    return this.roundMoney(credit - debit);
  }

  private async loadPumpExpenses(
    vendorId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<TripPumpExpense[]> {
    const qb = this.pumpExpenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.trip', 'trip')
      .leftJoinAndSelect('e.vendorProduct', 'vendorProduct')
      .where('e.vendorId = :vendorId', { vendorId })
      .andWhere('e.status = :status', { status: TripExpenseStatus.PAID })
      .andWhere('e.expenseDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('e.expenseDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('e.expenseDate', 'ASC')
      .addOrderBy('e.createdAt', 'ASC')
      .getMany();
  }

  private async loadPurchaseOrders(
    vendorId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<PurchaseOrder[]> {
    const qb = this.purchaseOrderRepo
      .createQueryBuilder('po')
      .where('po.vendorId = :vendorId', { vendorId })
      .andWhere('po.status = :status', {
        status: PurchaseOrderStatus.APPROVED,
      })
      .andWhere('po.orderDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('po.orderDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('po.orderDate', 'ASC')
      .addOrderBy('po.createdAt', 'ASC')
      .getMany();
  }

  private async loadVouchers(
    vendorId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<VendorVoucher[]> {
    const qb = this.voucherRepo
      .createQueryBuilder('v')
      .where('v.vendorId = :vendorId', { vendorId })
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

  private async loadMaintenanceVouchers(
    vendorId: string,
    dateFrom: string | null,
    asOf: string,
  ): Promise<MaintenanceVoucher[]> {
    const qb = this.maintenanceVoucherRepo
      .createQueryBuilder('mv')
      .leftJoinAndSelect('mv.purchaseOrder', 'purchaseOrder')
      .where('mv.vendorId = :vendorId', { vendorId })
      .andWhere('mv.status = :status', { status: VoucherStatus.PAID })
      .andWhere('mv.paymentDate <= :asOf', { asOf });

    if (dateFrom) {
      qb.andWhere('mv.paymentDate >= :dateFrom', { dateFrom });
    }

    return qb
      .orderBy('mv.paymentDate', 'ASC')
      .addOrderBy('mv.createdAt', 'ASC')
      .getMany();
  }

  private buildExpenseParticular(expense: TripPumpExpense): string {
    if (expense.lable?.trim()) return expense.lable.trim();
    if (expense.description?.trim()) return expense.description.trim();

    const parts: string[] = [];
    if (expense.trip?.tripCode) parts.push(`Trip ${expense.trip.tripCode}`);
    if (expense.vendorProduct?.name?.trim()) {
      parts.push(expense.vendorProduct.name.trim());
    }
    if (parts.length) return parts.join(' — ');
    return 'Pump / HSD Expense';
  }

  private buildPurchaseOrderParticular(po: PurchaseOrder): string {
    if (po.remarks?.trim()) return po.remarks.trim();
    return `Purchase Order ${po.purchaseOrderNo}`;
  }

  private buildMaintenancePaymentParticular(
    voucher: MaintenanceVoucher,
  ): string {
    if (voucher.remarks?.trim()) return voucher.remarks.trim();
    const poNo = voucher.purchaseOrder?.purchaseOrderNo;
    if (poNo) return `PO Payment ${poNo}`;
    return `Maintenance Payment ${voucher.voucherNumber}`;
  }

  private buildPaymentParticular(voucher: VendorVoucher): string {
    if (voucher.remarks?.trim()) return voucher.remarks.trim();

    const method = voucher.paymentMethod;
    if (method === PaymentMethod.CHEQUE) {
      const parts = ['CHQ'];
      if (voucher.chequeNumber?.trim()) {
        parts.push(`NO ${voucher.chequeNumber.trim()}`);
      }
      if (voucher.chequeBank?.trim()) {
        parts.push(voucher.chequeBank.trim());
      }
      return parts.join(' ');
    }
    if (method === PaymentMethod.TRANSFER) return 'BANK TRANSFER';
    if (method === PaymentMethod.ONLINE) return 'ONLINE PAYMENT';
    if (method === PaymentMethod.CASH) return 'CASH PAYMENT';
    return 'Vendor Payment';
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

  private roundQty(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }
}
