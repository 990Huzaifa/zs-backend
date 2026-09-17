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
import { User } from './user.entity';
import { Vendor } from './vendor.entity';
import { PaymentMethod, VoucherStatus } from './voucher.entity';

@Entity({ name: 'vendor_vouchers' })
export class VendorVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  voucherNumber: string;

  @Column()
  vendorId: string;

  @ManyToOne(() => Vendor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendorId' })
  vendor: Vendor;

  /** Cash / bank (asset) account */
  @Column()
  assetAccId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assetAccId' })
  assetAcc: ChartOfAccount;

  /** Vendor payable / party account */
  @Column()
  vendorAccId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendorAccId' })
  vendorAcc: ChartOfAccount;

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
