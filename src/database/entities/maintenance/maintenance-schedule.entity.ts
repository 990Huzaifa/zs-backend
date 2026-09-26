import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { Vehicle } from '../vehicle.entity';

export enum MaintenanceScheduleTriggerType {
    ODOMETER = 'odometer',
    TIME = 'time',
    ODOMETER_OR_TIME = 'odometer_or_time',
}

export enum MaintenanceScheduleStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

export enum MaintenanceTimeUnit {
    DAYS = 'days',
    MONTHS = 'months',
    YEARS = 'years',
}

@Entity('maintenance_schedules')
export class MaintenanceSchedule {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    vehicleId: string;

    @ManyToOne(() => Vehicle, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    // Example:
    // Engine Oil Change
    // Air Filter Replacement
    // Tyre Inspection
    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: MaintenanceScheduleTriggerType,
    })
    triggerType: MaintenanceScheduleTriggerType;

    // -----------------------------------
    // Odometer based scheduling
    // -----------------------------------

    // Example: every 10,000 KM
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    odometerInterval?: number | null;

    // Reading at which maintenance was last completed
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    lastServiceOdometer?: number | null;

    // Example: 130000 KM
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    nextDueOdometer?: number | null;

    // Alert e.g. 1000 KM before due
    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    odometerAlertBefore?: number | null;

    // -----------------------------------
    // Time based scheduling
    // -----------------------------------

    // Example: 6 MONTHS
    @Column({ type: 'int', nullable: true })
    timeInterval?: number | null;

    @Column({
        type: 'enum',
        enum: MaintenanceTimeUnit,
        nullable: true,
    })
    timeIntervalUnit?: MaintenanceTimeUnit | null;

    @Column({ type: 'timestamp', nullable: true })
    lastServiceDate?: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    nextDueDate?: Date | null;

    // Example: alert 7 days before
    @Column({ type: 'int', nullable: true })
    alertDaysBefore?: number | null;

    // -----------------------------------
    // Status
    // -----------------------------------

    @Column({
        type: 'enum',
        enum: MaintenanceScheduleStatus,
        default: MaintenanceScheduleStatus.ACTIVE,
    })
    status: MaintenanceScheduleStatus;

    @Column({ type: 'text', nullable: true })
    remarks?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}