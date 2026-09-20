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
import { Client } from './client.entity';
import { TaxRule } from './tax-rule.entity';
import { Trip } from './trip.entity';

export enum ClientInvoiceStatus {
    PENDING = 'pending',
    PAID = 'paid',
    CANCELLED = 'cancelled',
}

@Entity('client_invoices')
export class ClientInvoice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, (client) => client.invoices, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'clientId' })
    client: Client;

    @Column({ type: 'varchar', length: 255, unique: true })
    invoiceNumber: string;

    @Column({ type: 'date' })
    invoiceDate: Date;

    @Column({
        type: 'enum',
        enum: ClientInvoiceStatus,
        default: ClientInvoiceStatus.PENDING,
    })
    invoiceStatus: ClientInvoiceStatus;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    freightAmount: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    salesTaxAmount: string;

    /**
     * Income-tax / standalone WHT (e.g. WHT-FBR) — TAX W.H column.
     * Not the same as sale-tax withheld (W.H SRB/PRA).
     */
    @Column({ type: 'decimal', precision: 10, scale: 2 })
    withHoldingTaxAmount: string;

  /**
   * Sum of item sale-tax withheld amounts (snapshot of client withHeld % × sales tax).
   * Deducted from receivable / netAmount (with income WHT).
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  saleTaxWithheldAmount: string;

    /** freight + salesTax − income WHT − saleTaxWithheld (2 dp sum of items). */
    @Column({ type: 'decimal', precision: 10, scale: 2 })
    netAmount: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    note?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => ClientInvoiceItem, (item) => item.invoice, {
        cascade: true,
    })
    items: ClientInvoiceItem[];
}

@Entity('client_invoice_items')
export class ClientInvoiceItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    invoiceId: string;

    @ManyToOne(() => ClientInvoice, (invoice) => invoice.items, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'invoiceId' })
    invoice: ClientInvoice;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    freightAmount: string;

    @Column({ type: 'uuid' })
    saleTaxRuleId: string;

    @ManyToOne(() => TaxRule, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'saleTaxRuleId' })
    saleTaxRule: TaxRule;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    saleTaxRate: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    salesTaxAmount: string;

    /**
     * Snapshot of client's selected withHeld % for this sale tax rule at invoice time.
     * e.g. 80 for 80% of S.TAX withheld.
     */
    @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
    saleTaxWithheldPercent: string;

  /** salesTaxAmount × saleTaxWithheldPercent / 100 — deducted from net/receivable. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  saleTaxWithheldAmount: string;

    @Column({ type: 'uuid' })
    withholdingTaxRuleId: string;

    @ManyToOne(() => TaxRule, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'withholdingTaxRuleId' })
    withholdingTaxRule: TaxRule;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    withholdingTaxRate: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    withholdingTaxAmount: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    netAmount: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
