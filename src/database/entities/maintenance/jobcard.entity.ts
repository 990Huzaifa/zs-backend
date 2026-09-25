import { CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { PurchaseQuotation } from "./purchase-quotation.entity";


export enum JobCardStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    CANCELLED = 'CANCELLED',
}


@Entity('jobcards')
export class JobCard {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    jobcardNumber: string;

    @Column()
    description: string;

    @Column({ type: 'date' })
    jobcardDate: Date;

    @Column({ type: 'enum', enum: JobCardStatus, default: JobCardStatus.PENDING })
    status: JobCardStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => JobCardItem, (item) => item.jobcard)
    items: JobCardItem[];

    @OneToMany(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.jobcard)
    purchaseQuotations: PurchaseQuotation[];
}

@Entity('jobcard_items')
export class JobCardItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    jobcardId: string;

    @ManyToOne(() => JobCard, (jobcard) => jobcard.items, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'jobcardId' })
    jobcard: JobCard;

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