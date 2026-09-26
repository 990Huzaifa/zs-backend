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

import { Vehicle } from '../vehicle.entity';
import { User } from '../user.entity';
import { MaintenanceSchedule } from './maintenance-schedule.entity';

export enum MaintenanceType {
    SCHEDULED = 'scheduled',
    UNPLANNED = 'unplanned',
}

export enum JobCardPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
}

export enum JobCardStatus {
    DRAFT = 'draft',
    OPEN = 'open',
    IN_PROGRESS = 'in_progress',
    ON_HOLD = 'on_hold',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export enum JobCardFindingStatus {
    OPEN = 'open',
    IN_PROGRESS = 'in_progress',
    RESOLVED = 'resolved',
    DEFERRED = 'deferred',
    CANCELLED = 'cancelled',
}

@Entity('job_cards')
export class JobCard {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // e.g. JC-000001
    @Column({ type: 'varchar', length: 50, unique: true })
    jobCardNo: string;

    // -------------------------
    // Vehicle
    // -------------------------

    @Column({ type: 'uuid' })
    vehicleId: string;

    @ManyToOne(() => Vehicle, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    // driver id
    @Column({ type: 'uuid', nullable: true })
    driverId?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'driverId' })
    driver?: User | null;

    // Odometer reading when job card is created
    @Column({ type: 'decimal', precision: 12, scale: 2 })
    odometerReading: number;

    @Column({ type: 'varchar', length: 255 })
    jobCardTitle: string;

    // -------------------------
    // Maintenance
    // -------------------------

    @Column({
        type: 'enum',
        enum: MaintenanceType,
    })
    maintenanceType: MaintenanceType;

    @Column({
        type: 'enum',
        enum: JobCardPriority,
        default: JobCardPriority.MEDIUM,
    })
    priority: JobCardPriority;

    @Column({
        type: 'enum',
        enum: JobCardStatus,
        default: JobCardStatus.DRAFT,
    })
    status: JobCardStatus;

    // -------------------------
    // Reporting
    // -------------------------

    @Column({ type: 'uuid', nullable: true })
    reportedById?: string | null;

    @ManyToOne(() => User, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'reportedById' })
    reportedBy?: User | null;

    @Column({ type: 'timestamp', nullable: true })
    reportedAt?: Date | null;

    // -------------------------
    // Job lifecycle
    // -------------------------

    @Column({ type: 'timestamp', nullable: true })
    startedAt?: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    completedAt?: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    cancelledAt?: Date | null;

    @Column({ type: 'text', nullable: true })
    cancellationReason?: string | null;

    // -------------------------
    // General
    // -------------------------

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => JobCardItems, (item) => item.jobCard)
    items: JobCardItems[];

    @Column({ type: 'uuid', nullable: true })
    maintenanceScheduleId?: string | null;

    @ManyToOne(() => MaintenanceSchedule, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'maintenanceScheduleId' })
    maintenanceSchedule?: MaintenanceSchedule | null;
}

@Entity('job_card_items')
export class JobCardItems {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    jobCardId: string;

    @ManyToOne(
        () => JobCard,
        (jobCard) => jobCard.items,
        { onDelete: 'CASCADE' },
    )
    @JoinColumn({ name: 'jobCardId' })
    jobCard: JobCard;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: JobCardFindingStatus,
        default: JobCardFindingStatus.OPEN,
    })
    status: JobCardFindingStatus;

    @Column({ type: 'text', nullable: true })
    resolutionNotes?: string | null;

    @Column({ type: 'timestamp', nullable: true })
    resolvedAt?: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}