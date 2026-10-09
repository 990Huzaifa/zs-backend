import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationSeverity } from './notification.entity';
import { User } from './user.entity';

export enum AlertStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum AlertType {
  DOCUMENT_EXPIRY = 'DOCUMENT_EXPIRY',
}

export enum AlertModule {
  DRIVER = 'DRIVER',
  VEHICLE = 'VEHICLE',
  CLIENT = 'CLIENT',
  TRANSPORTER = 'TRANSPORTER',
  BROKER = 'BROKER',
}

export enum AlertEntityType {
  DRIVER_DOCUMENT = 'DRIVER_DOCUMENT',
  VEHICLE_DOCUMENT = 'VEHICLE_DOCUMENT',
  CLIENT_DOCUMENT = 'CLIENT_DOCUMENT',
  TRANSPORTER_DOCUMENT = 'TRANSPORTER_DOCUMENT',
  BROKER_DOCUMENT = 'BROKER_DOCUMENT',
  DRIVER = 'DRIVER',
}

@Entity('alerts')
@Index(['status'])
@Index(['type'])
@Index(['dueAt'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 100 })
  module: string;

  @Column({
    type: 'enum',
    enum: NotificationSeverity,
    default: NotificationSeverity.WARNING,
  })
  severity: NotificationSeverity;

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.OPEN,
  })
  status: AlertStatus;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entityType: string | null;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'date' })
  dueAt: string;

  @Column({ type: 'date' })
  windowStartsAt: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  sourceKey: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
