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

import { Vendor } from '../vendor.entity';
import { VendorProduct } from '../vendor.entity';
import { JobCard } from './jobcard.entity';

export enum PurchaseQuotationStatus {
    DRAFT = 'draft',
    SUBMITTED = 'submitted',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

export enum PurchaseQuotationItemType {
    PRODUCT = 'product',
    SERVICE = 'service',
}

@Entity('purchase_quotations')
export class PurchaseQuotation {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    // PQ-000001
    @Column({ type: 'varchar', length: 50, unique: true })
    quotationNo: string;

    // -----------------------------------
    // Job Card - Optional
    // -----------------------------------

    @Column({ type: 'uuid', nullable: true })
    jobCardId?: string | null;

    @ManyToOne(() => JobCard, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'jobCardId' })
    jobCard?: JobCard | null;

    // -----------------------------------
    // Vendor
    // -----------------------------------

    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    // Vendor quotation/reference number
    @Column({ type: 'varchar', length: 100, nullable: true })
    vendorQuotationNo?: string | null;

    @Column({ type: 'date' })
    quotationDate: Date;

    @Column({ type: 'date', nullable: true })
    validUntil?: Date | null;

    // -----------------------------------
    // Amount
    // -----------------------------------

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        default: 0,
    })
    subTotal: number;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        default: 0,
    })
    discountAmount: number;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        default: 0,
    })
    taxAmount: number;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        default: 0,
    })
    grandTotal: number;

    // -----------------------------------
    // Status
    // -----------------------------------

    @Column({
        type: 'enum',
        enum: PurchaseQuotationStatus,
        default: PurchaseQuotationStatus.DRAFT,
    })
    status: PurchaseQuotationStatus;

    @Column({ type: 'text', nullable: true })
    termsAndConditions?: string | null;

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    @OneToMany(
        () => PurchaseQuotationItem,
        (item) => item.purchaseQuotation,
        {
            cascade: true,
        },
    )
    items: PurchaseQuotationItem[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// Purchase Quotation Item
// ======================================================

@Entity('purchase_quotation_items')
export class PurchaseQuotationItem {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    purchaseQuotationId: string;

    @ManyToOne(
        () => PurchaseQuotation,
        (quotation) => quotation.items,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({ name: 'purchaseQuotationId' })
    purchaseQuotation: PurchaseQuotation;

    // -----------------------------------
    // Type
    // -----------------------------------

    @Column({
        type: 'enum',
        enum: PurchaseQuotationItemType,
    })
    itemType: PurchaseQuotationItemType;

    // Product is optional because item can be SERVICE
    // or a custom/non-catalogue product.
    @Column({ type: 'uuid', nullable: true })
    productId?: string | null;

    @ManyToOne(() => VendorProduct, {
        nullable: true,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product?: VendorProduct | null;

    // Snapshot / custom description
    @Column({ type: 'varchar', length: 255 })
    itemName: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    // -----------------------------------
    // Quantity & Price
    // -----------------------------------

    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 1,
    })
    quantity: number;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
    })
    unitPrice: number;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
    })
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}