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

import { User } from '../user.entity';
import { VendorProduct } from '../vendor.entity';
import { JobCard } from './jobcard.entity';
import { MaintenanceInventoryBatch } from './maintenance-inventory.entity';

export enum MaintenanceStockIssueStatus {
    DRAFT = 'draft',
    PENDING_APPROVAL = 'pending_approval',
    APPROVED = 'approved',
    CANCELLED = 'cancelled',
}

@Entity('maintenance_stock_issues')
export class MaintenanceStockIssue {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    // MSI-000001
    @Column({
        type: 'varchar',
        length: 50,
        unique: true,
    })
    issueNo: string;

    // --------------------------------
    // Job Card
    // --------------------------------

    @Column({ type: 'uuid' })
    jobCardId: string;

    @ManyToOne(() => JobCard, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'jobCardId' })
    jobCard: JobCard;

    // --------------------------------
    // Issue Information
    // --------------------------------

    @Column({ type: 'timestamp' })
    issueDate: Date;

    @Column({ type: 'uuid', nullable: true })
    issuedById?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'issuedById' })
    issuedBy?: User | null;

    // --------------------------------
    // Status
    // --------------------------------

    @Column({
        type: 'enum',
        enum: MaintenanceStockIssueStatus,
        default: MaintenanceStockIssueStatus.DRAFT,
    })
    status: MaintenanceStockIssueStatus;

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
        () => MaintenanceStockIssueItem,
        (item) => item.stockIssue,
        {
            cascade: true,
        },
    )
    items: MaintenanceStockIssueItem[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ======================================================
// STOCK ISSUE ITEM
// ======================================================

@Entity('maintenance_stock_issue_items')
export class MaintenanceStockIssueItem {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    stockIssueId: string;

    @ManyToOne(
        () => MaintenanceStockIssue,
        (stockIssue) => stockIssue.items,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({ name: 'stockIssueId' })
    stockIssue: MaintenanceStockIssue;

    // --------------------------------
    // Product
    // --------------------------------

    @Column({ type: 'uuid' })
    productId: string;

    @ManyToOne(() => VendorProduct, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    // --------------------------------
    // Batch
    // --------------------------------

    @Column({ type: 'uuid' })
    batchId: string;

    @ManyToOne(() => MaintenanceInventoryBatch, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'batchId' })
    batch: MaintenanceInventoryBatch;

    // Actual quantity issued
    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
    })
    quantity: number;

    // Cost snapshot at issue time
    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        nullable: true,
    })
    unitCost?: number | null;

    @Column({
        type: 'decimal',
        precision: 15,
        scale: 2,
        nullable: true,
    })
    totalCost?: number | null;

    @Column({
        type: 'text',
        nullable: true,
    })
    remarks?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}