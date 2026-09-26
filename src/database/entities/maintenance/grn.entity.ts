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

import { PurchaseOrder, PurchaseOrderItem } from './purchase-order.entity';
import { VendorProduct } from '../vendor.entity';
import { User } from '../user.entity';

export enum GRNStatus {
    DRAFT = 'draft',
    PENDING_APPROVAL = 'pending_approval',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

@Entity('goods_receipt_notes')
export class GoodsReceiptNote {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    // GRN-000001
    @Column({
        type: 'varchar',
        length: 50,
        unique: true,
    })
    grnNo: string;

    // --------------------------------
    // Purchase Order
    // --------------------------------

    @Column({ type: 'uuid' })
    purchaseOrderId: string;

    @ManyToOne(() => PurchaseOrder, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'purchaseOrderId' })
    purchaseOrder: PurchaseOrder;

    // --------------------------------
    // Receiving
    // --------------------------------

    @Column({ type: 'timestamp' })
    receivedAt: Date;

    @Column({ type: 'uuid', nullable: true })
    receivedById?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'receivedById' })
    receivedBy?: User | null;

    // Vendor invoice / delivery challan etc.
    @Column({
        type: 'varchar',
        length: 100,
        nullable: true,
    })
    vendorDocumentNo?: string | null;

    // --------------------------------
    // Status
    // --------------------------------

    @Column({
        type: 'enum',
        enum: GRNStatus,
        default: GRNStatus.DRAFT,
    })
    status: GRNStatus;

    // --------------------------------
    // Approval
    // --------------------------------

    @Column({ type: 'uuid', nullable: true })
    approvedById?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'approvedById' })
    approvedBy?: User | null;

    @Column({ type: 'timestamp', nullable: true })
    approvedAt?: Date | null;

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    // --------------------------------
    // Items
    // --------------------------------

    @OneToMany(
        () => GoodsReceiptNoteItem,
        (item) => item.grn,
        {
            cascade: true,
        },
    )
    items: GoodsReceiptNoteItem[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// GRN ITEM
// ======================================================

@Entity('goods_receipt_note_items')
export class GoodsReceiptNoteItem {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    grnId: string;

    @ManyToOne(
        () => GoodsReceiptNote,
        (grn) => grn.items,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({ name: 'grnId' })
    grn: GoodsReceiptNote;

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => VendorProduct, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    @Column({ type: 'uuid' })
    purchaseOrderItemId: string;

    @ManyToOne(() => PurchaseOrderItem, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'purchaseOrderItemId' })
    purchaseOrderItem: PurchaseOrderItem;   

    // Quantity actually received
    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
    })
    receivedQuantity: number;

    // Rejected/damaged quantity during receiving
    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
        default: 0,
    })
    rejectedQuantity: number;

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}