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
import { User } from './user.entity';

/** Module/resource being exported (extend as new list exports are added). */
export enum ExportEntityType {
  DRIVER = 'DRIVER',
  VEHICLE = 'VEHICLE',
}

export enum ExportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
}

export enum ExportMode {
  LIST = 'LIST',
  DETAIL_PAGES = 'DETAIL_PAGES',
  DOCUMENTS = 'DOCUMENTS',
}

export enum ExportJobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Entity('export_jobs')
export class ExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'enum', enum: ExportEntityType })
  entityType: ExportEntityType;

  @Column({
    type: 'enum',
    enum: ExportJobStatus,
    default: ExportJobStatus.QUEUED,
  })
  status: ExportJobStatus;

  @Column({ type: 'enum', enum: ExportFormat })
  format: ExportFormat;

  @Column({ type: 'enum', enum: ExportMode })
  mode: ExportMode;

  /** Selected record ids snapshot (null when export uses filters). */
  @Column({ type: 'uuid', array: true, nullable: true })
  recordIds?: string[] | null;

  /** Entity-specific filter snapshot (driver status, vehicle type, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  filters?: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  recordCount: number;

  @Column({ type: 'varchar', nullable: true })
  fileName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  storageKey?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Index()
  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
