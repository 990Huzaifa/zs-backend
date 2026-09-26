import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { VendorProduct } from '../vendor.entity';
import { JobCard } from './jobcard.entity';
import { GoodsReceiptNote } from './grn.entity';
import { User } from '../user.entity';


// ======================================================
// ENUMS
// ======================================================

export enum MaintenanceStockMovementType {
    IN = 'in',
    OUT = 'out',
    ADJUSTMENT_IN = 'adjustment_in',
    ADJUSTMENT_OUT = 'adjustment_out',
}

export enum MaintenanceStockReferenceType {
    GRN = 'grn',
    JOB_CARD = 'job_card',
    ADJUSTMENT = 'adjustment',
}

export enum MaintenanceBatchStatus {
    ACTIVE = 'active',
    DEPLETED = 'depleted',
    BLOCKED = 'blocked',
}


// ======================================================
// MAINTENANCE INVENTORY STOCK
// Current total stock per product
// ======================================================

@Entity('maintenance_inventory_stocks')
export class MaintenanceInventoryStock {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid', unique: true })
    productId: string;

    @ManyToOne(() => VendorProduct, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    // Physical stock currently available
    @Column({
        type: 'integer',
        default: 0,
    })
    quantityOnHand: number;

    // Reserved for open Job Cards
    @Column({
        type: 'integer',
        default: 0,
    })
    reservedQuantity: number;

    // Damaged / unusable stock
    @Column({
        type: 'integer',
        default: 0,
    })
    damagedQuantity: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// MAINTENANCE INVENTORY BATCH
// ======================================================

@Entity('maintenance_inventory_batches')
export class MaintenanceInventoryBatch {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => VendorProduct, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    // e.g. BAT-000001
    @Column({
        type: 'varchar',
        length: 50,
        unique: true,
    })
    batchNo: string;

    // Quantity originally received
    @Column({
        type: 'integer',
    })
    receivedQuantity: number;

    // Current quantity remaining in this batch
    @Column({
        type: 'integer',
    })
    availableQuantity: number;

    // Purchase cost per unit
    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        nullable: true,
    })
    unitCost?: number | null;

    @Column({
        type: 'date',
        nullable: true,
    })
    manufacturingDate?: Date | null;

    @Column({
        type: 'date',
        nullable: true,
    })
    expiryDate?: Date | null;

    @Column({
        type: 'enum',
        enum: MaintenanceBatchStatus,
        default: MaintenanceBatchStatus.ACTIVE,
    })
    status: MaintenanceBatchStatus;

    // Which GRN created this batch
    @Column({
        type: 'uuid',
        nullable: true,
    })
    grnId?: string | null;

    @ManyToOne(() => GoodsReceiptNote, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'grnId' })
    grn?: GoodsReceiptNote | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// MAINTENANCE STOCK LOG
// Every inventory movement
// ======================================================

@Entity('maintenance_stock_logs')
export class MaintenanceStockLog {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => VendorProduct, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    @Column({
        type: 'uuid',
        nullable: true,
    })
    batchId?: string | null;

    @ManyToOne(() => MaintenanceInventoryBatch, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'batchId' })
    batch?: MaintenanceInventoryBatch | null;

    @Column({
        type: 'enum',
        enum: MaintenanceStockMovementType,
    })
    movementType: MaintenanceStockMovementType;

    @Column({
        type: 'enum',
        enum: MaintenanceStockReferenceType,
    })
    referenceType: MaintenanceStockReferenceType;

    @Column({
        type: 'integer',
    })
    quantity: number;

    // Stock before this transaction
    @Column({
        type: 'integer',
    })
    quantityBefore: number;

    // Stock after this transaction
    @Column({
        type: 'integer',
    })
    quantityAfter: number;

    // --------------------------------
    // References
    // --------------------------------

    @Column({
        type: 'uuid',
        nullable: true,
    })
    grnId?: string | null;

    @ManyToOne(() => GoodsReceiptNote, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'grnId' })
    grn?: GoodsReceiptNote | null;

    @Column({
        type: 'uuid',
        nullable: true,
    })
    jobCardId?: string | null;

    @ManyToOne(() => JobCard, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'jobCardId' })
    jobCard?: JobCard | null;

    // --------------------------------
    // Performed By
    // --------------------------------

    @Column({
        type: 'uuid',
        nullable: true,
    })
    performedById?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'performedById' })
    performedBy?: User | null;

    @Column({
        type: 'text',
        nullable: true,
    })
    remarks?: string | null;

    @CreateDateColumn()
    createdAt: Date;
}