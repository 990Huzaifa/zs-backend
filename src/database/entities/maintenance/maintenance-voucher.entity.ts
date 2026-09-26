import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChartOfAccount } from '../chart-of-account.entity';
import { User } from '../user.entity';
import { Vendor } from '../vendor.entity';
import { PaymentMethod, VoucherStatus } from '../voucher.entity';
import { PurchaseOrder } from './purchase-order.entity';

/**
 * Payment against an approved Purchase Order.
 * Select PO → vendor is taken from PO; pick cash/bank asset account.
 * Same shape as vendor vouchers (no line items).
 */
@Entity({ name: 'maintenance_vouchers' })
export class MaintenanceVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  voucherNumber: string;

  /** Required — voucher is always against a PO. */
  @Column()
  purchaseOrderId: string;

  @ManyToOne(() => PurchaseOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  /** Copied from PO on create (UI auto-fills when PO is selected). */
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

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  /** Required when paymentMethod is CHEQUE */
  @Column({ type: 'varchar', nullable: true })
  chequeNumber: string | null;

  @Column({ type: 'date', nullable: true })
  chequeDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  chequeBank: string | null;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  paymentAmount: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  /** S3 object keys for payment proof images */
  @Column({ type: 'jsonb', nullable: true })
  proofImages: string[] | null;

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
