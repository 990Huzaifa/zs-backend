import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChartOfAccount } from './chart-of-account.entity';
import { Client } from './client.entity';
import { User } from './user.entity';
import { PaymentMethod, VoucherStatus } from './voucher.entity';

@Entity({ name: 'client_vouchers' })
export class ClientVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  voucherNumber: string;

  @Column()
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  /** Cash / bank (asset) account */
  @Column()
  assetAccId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assetAccId' })
  assetAcc: ChartOfAccount;

  /** Client receivable / party account */
  @Column()
  clientAccId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clientAccId' })
  clientAcc: ChartOfAccount;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  /** Required when paymentMethod is CHEQUE */
  @Column({ type: 'varchar', nullable: true })
  chequeNumber: string | null;

  @Column({ type: 'date', nullable: true })
  chequeDate: Date | null;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  paymentAmount: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({
    type: 'enum',
    enum: VoucherStatus,
    default: VoucherStatus.PENDING,
  })
  status: VoucherStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
