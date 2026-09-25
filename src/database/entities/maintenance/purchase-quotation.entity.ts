import { CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { JobCard } from "./jobcard.entity";
import { Vendor, VendorProduct } from "../vendor.entity";


export enum PurchaseQuotationStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    CANCELLED = 'CANCELLED',
}


@Entity('purchase_quotations')
export class PurchaseQuotation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    jobcardId: string;

    @ManyToOne(() => JobCard, (jobcard) => jobcard.purchaseQuotations, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'jobcardId' })
    jobcard: JobCard;

    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, (vendor) => vendor.purchaseQuotations, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    @Column({ unique: true })
    purchaseQuotationNumber: string;

    @Column()
    description: string;

    @Column({ type: 'date' })
    purchaseQuotationDate: Date;

    @Column({ type: 'enum', enum: PurchaseQuotationStatus, default: PurchaseQuotationStatus.PENDING })
    status: PurchaseQuotationStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => PurchaseQuotationItem, (item) => item.purchaseQuotation)
    items: PurchaseQuotationItem[];

}

@Entity('purchase_quotation_items')
export class PurchaseQuotationItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    purchaseQuotationId: string;

    @ManyToOne(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.items, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'purchaseQuotationId' })
    purchaseQuotation: PurchaseQuotation;

    @Column({ type: 'uuid', nullable: true })
    productId?: string | null;

    @ManyToOne(() => VendorProduct, (product) => product.purchaseQuotationItems, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'productId' })
    product: VendorProduct;

    @Column()
    itemDescription: string;

    @Column({ type: 'integer', nullable: true })
    pieces?: number | null;

    @Column({ type: 'integer', nullable: true })
    cost?: number | null;

    @Column({ type: 'integer' })
    amount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}