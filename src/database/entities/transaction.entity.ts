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
