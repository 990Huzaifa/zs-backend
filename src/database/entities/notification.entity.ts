import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    ManyToOne,
    OneToMany,
    Unique,
    JoinColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationSeverity {
    INFO = 'info',
    SUCCESS = 'success',
    WARNING = 'warning',
    CRITICAL = 'critical',
}

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Example: INVOICE_CLEARING_REMINDER, TRIP_ASSIGNED
    @Column({ type: 'varchar', length: 100 })
    type: string;

    // Example: BILLING, TRIP, VEHICLE, HR
    @Column({ type: 'varchar', length: 100 })
    module: string;

    @Column({
        type: 'enum',
        enum: NotificationSeverity,
        default: NotificationSeverity.INFO,
    })
    severity: NotificationSeverity;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text' })
    message: string;

    // Example: CLIENT_INVOICE, TRIP, VEHICLE
    @Column({ type: 'varchar', length: 100, nullable: true })
    entityType: string | null;

    @Column({ type: 'uuid', nullable: true })
    entityId: string | null;

    // Example: /invoices/uuid
    @Column({ type: 'varchar', length: 500, nullable: true })
    actionUrl: string | null;

    // Additional dynamic information
    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    // Groups daily reminders for the same invoice
    @Index()
    @Column({ type: 'varchar', length: 255, nullable: true })
    groupKey: string | null;

    // Prevents duplicate notification generation
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 255 })
    eventKey: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @OneToMany(
        () => NotificationRecipient,
        (recipient) => recipient.notification,
    )
    recipients: NotificationRecipient[];
}

@Entity('notification_recipients')
@Unique(['notificationId', 'userId'])
@Index(['userId', 'readAt'])
export class NotificationRecipient {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    notificationId: string;

    @ManyToOne(
        () => Notification,
        (notification) => notification.recipients,
        { onDelete: 'CASCADE' },
    )
    @JoinColumn({ name: 'notificationId' })
    notification: Notification;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, {
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'userId' })
    user: User;

    // When the user reads the notification
    @Column({
        type: 'timestamptz',
        nullable: true,
        default: null,
    })
    readAt: Date | null;

    // When the user dismisses the notification
    @Column({
        type: 'timestamptz',
        nullable: true,
        default: null,
    })
    dismissedAt: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}