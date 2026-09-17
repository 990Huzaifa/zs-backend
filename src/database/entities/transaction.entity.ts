import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChartOfAccount } from './chart-of-account.entity';

export enum AccountTransactionReferenceType {
  OPENING_BALANCE = 'OPENING_BALANCE',

  TRIP_OFFICE_EXPENSE = 'TRIP_OFFICE_EXPENSE',
  TRIP_PUMP_EXPENSE = 'TRIP_PUMP_EXPENSE',
  TRIP_FUEL_EXPENSE = 'TRIP_FUEL_EXPENSE',
  TRIP_MTAG_EXPENSE = 'TRIP_MTAG_EXPENSE',
  TRIP_OTHER_EXPENSE = 'TRIP_OTHER_EXPENSE',

  /** Contra: credit source (from) account */
  CONTRA_VOUCHER_FROM = 'CONTRA_VOUCHER_FROM',
  /** Contra: debit destination (to) account */
  CONTRA_VOUCHER_TO = 'CONTRA_VOUCHER_TO',

  /** Expense: credit asset (cash/bank out) */
  EXPENSE_VOUCHER_ASSET = 'EXPENSE_VOUCHER_ASSET',
  /** Expense: debit expense account */
  EXPENSE_VOUCHER_EXPENSE = 'EXPENSE_VOUCHER_EXPENSE',

  /** Client voucher: debit asset (cash/bank in) */
  CLIENT_VOUCHER_ASSET = 'CLIENT_VOUCHER_ASSET',
  /** Client voucher: credit client receivable / party account */
  CLIENT_VOUCHER_CLIENT = 'CLIENT_VOUCHER_CLIENT',

  /** Vendor voucher: credit asset (cash/bank out) */
  VENDOR_VOUCHER_ASSET = 'VENDOR_VOUCHER_ASSET',
  /** Vendor voucher: debit vendor payable / party account */
  VENDOR_VOUCHER_VENDOR = 'VENDOR_VOUCHER_VENDOR',

  /** Bilty expense: debit expense account */
  BILTY_EXPENSE = 'BILTY_EXPENSE',

  /** Client invoice create: debit client AR (gross = freight + sales tax) */
  CLIENT_INVOICE_AR = 'CLIENT_INVOICE_AR',
  /** Client invoice create: credit freight revenue */
  CLIENT_INVOICE_REVENUE = 'CLIENT_INVOICE_REVENUE',
  /** Client invoice create: credit sales tax payable */
  CLIENT_INVOICE_TAX = 'CLIENT_INVOICE_TAX',

  /** Client invoice paid: debit cash/bank */
  CLIENT_INVOICE_ASSET = 'CLIENT_INVOICE_ASSET',
  /** Client invoice paid: debit WHT receivable (when client withholds) */
  CLIENT_INVOICE_WHT = 'CLIENT_INVOICE_WHT',
  /** Client invoice paid: credit client AR (clear receivable) */
  CLIENT_INVOICE_AR_CLEAR = 'CLIENT_INVOICE_AR_CLEAR',
}

@Entity('transactions')
  @Index(['chartOfAccountId'])
  @Index(['chartOfAccountId', 'createdAt'])
  @Index(['referenceType', 'referenceId'])
  @Index(['chartOfAccountId', 'transactionDate', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  chartOfAccountId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chartOfAccountId' })
  chartOfAccount: ChartOfAccount;

  @Column({ type: 'enum', enum: AccountTransactionReferenceType })
  referenceType: AccountTransactionReferenceType;

  @Column({ type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ type: 'date' })
  transactionDate: Date;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  debitAmount: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditAmount: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
