import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum ActivityActorType {
  ADMIN = 'admin',
  USER = 'user',
  SYSTEM = 'system',
}

/** UI "Type" badges: Admin / Factory / Broker / Driver */
export enum ActivityUserType {
  ADMIN = 'ADMIN',
  FACTORY = 'FACTORY',
  BROKER = 'BROKER',
  DRIVER = 'DRIVER',
}

/** UI module filter values */
export enum ActivityModule {
  USERS_ACCESS = 'USERS_ACCESS',
  FINANCE = 'FINANCE',
  BILLING = 'BILLING',
  TRIPS = 'TRIPS',
  MARKETPLACE = 'MARKETPLACE',
}

/** Common actions shown in the Activity Logs UI */
export enum ActivityAction {
  LOGIN = 'LOGIN',
  VIEW = 'VIEW',
  APPROVE = 'APPROVE',
  ISSUE = 'ISSUE',
  POST = 'POST',
  CREATE = 'CREATE',
  SETTLE = 'SETTLE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ActivityActorType,
  })
  actorType: ActivityActorType;

  @Column({ type: 'uuid', nullable: true })
  adminId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @ManyToOne(() => User, (user) => user.activities, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  /** Denormalized display name for the actor (survives user delete) */
  @Column({ type: 'varchar', nullable: true })
  actorName?: string | null;

  @Column({
    type: 'enum',
    enum: ActivityUserType,
    nullable: true,
  })
  userType?: ActivityUserType | null;

  @Column({
    type: 'enum',
    enum: ActivityAction,
  })
  action: ActivityAction;

  @Column({
    type: 'enum',
    enum: ActivityModule,
    nullable: true,
  })
  module?: ActivityModule | null;

  /** Human-readable record ref shown in UI (e.g. PMT-4101, TRP-1051) */
  @Column({ type: 'varchar', nullable: true })
  record?: string | null;

  @Column({ type: 'varchar', nullable: true })
  entityType?: string | null;

  @Column({ type: 'uuid', nullable: true })
  entityId?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
