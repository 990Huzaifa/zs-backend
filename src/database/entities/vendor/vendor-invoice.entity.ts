import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Transaction } from '../transaction.entity';
import { Vendor } from './vendor.entity';

export enum VendorInvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('vendor_invoices')
export class VendorInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vendorId: string;

  @ManyToOne(() => Vendor, (vendor) => vendor.invoices, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vendorId' })
  vendor: Vendor;

  @Column({ type: 'varchar', unique: true })
  invoiceNumber: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date' })
  invoiceDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    type: 'enum',
    enum: VendorInvoiceStatus,
    default: VendorInvoiceStatus.PENDING,
  })
  status: VendorInvoiceStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => VendorInvoiceItem, (item) => item.invoice)
  items: VendorInvoiceItem[];
}

@Entity('vendor_invoice_items')
export class VendorInvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vendorInvoiceId: string;

  @ManyToOne(() => VendorInvoice, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendorInvoiceId' })
  invoice: VendorInvoice;

  /** Linked purchase / payable accounting transaction */
  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.vendorInvoiceItems, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
