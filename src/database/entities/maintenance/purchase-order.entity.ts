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

import { Vendor, VendorProduct } from '../vendor.entity';
import {
    PurchaseQuotation,
    PurchaseQuotationItemType,
} from './purchase-quotation.entity';

export enum PurchaseOrderStatus {
    DRAFT = 'draft',
    PENDING_APPROVAL = 'pending_approval',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

export enum PurchaseOrderReceivingStatus {
    NOT_RECEIVED = 'not_received',
    PARTIALLY_RECEIVED = 'partially_received',
    RECEIVED = 'received',
}

@Entity('purchase_orders')
export class PurchaseOrder {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    // PO-000001
    @Column({ type: 'varchar', length: 50, unique: true })
    purchaseOrderNo: string;

    // -----------------------------------
    // Purchase Quotation
    // -----------------------------------

    @Column({ type: 'uuid' })
    purchaseQuotationId: string;

    @ManyToOne(() => PurchaseQuotation, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'purchaseQuotationId' })
    purchaseQuotation: PurchaseQuotation;

    // -----------------------------------
    // Vendor
    // -----------------------------------

    // Keep vendor snapshot/reference directly on PO.
    // PO should remain operationally usable without
    // traversing PQ every time.
    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    // -----------------------------------
    // Dates
    // -----------------------------------

    @Column({ type: 'date' })
    orderDate: Date;

    @Column({ type: 'date', nullable: true })
    expectedDeliveryDate?: Date | null;

    // -----------------------------------
    // Amounts
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
        enum: PurchaseOrderStatus,
        default: PurchaseOrderStatus.DRAFT,
    })
    status: PurchaseOrderStatus;

    @Column({
        type: 'enum',
        enum: PurchaseOrderReceivingStatus,
        default: PurchaseOrderReceivingStatus.NOT_RECEIVED,
    })
    receivingStatus: PurchaseOrderReceivingStatus;

    // -----------------------------------
    // Approval
    // -----------------------------------

    @Column({ type: 'uuid', nullable: true })
    approvedById?: string | null;

    @Column({ type: 'timestamp', nullable: true })
    approvedAt?: Date | null;

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    @Column({ type: 'text', nullable: true })
    termsAndConditions?: string | null;

    // -----------------------------------
    // Items
    // -----------------------------------

    @OneToMany(
        () => PurchaseOrderItem,
        (item) => item.purchaseOrder,
        {
            cascade: true,
        },
    )
    items: PurchaseOrderItem[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// Purchase Order Item
// ======================================================

@Entity('purchase_order_items')
export class PurchaseOrderItem {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    purchaseOrderId: string;

    @ManyToOne(
        () => PurchaseOrder,
        (purchaseOrder) => purchaseOrder.items,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({ name: 'purchaseOrderId' })
    purchaseOrder: PurchaseOrder;

    @Column({
        type: 'enum',
        enum: PurchaseQuotationItemType,
    })
    itemType: PurchaseQuotationItemType;

    @Column({ type: 'uuid', nullable: true })
    productId?: string | null;

    @ManyToOne(() => VendorProduct, {
        nullable: true,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product?: VendorProduct | null;

    // Snapshot from PQ
    @Column({ type: 'varchar', length: 255 })
    itemName: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
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

    // Useful later for GRN / partial receiving
    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    receivedQuantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}