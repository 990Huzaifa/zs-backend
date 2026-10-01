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
import { Employee } from './employee.entity';

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  CASUAL = 'CASUAL',
  COMP_OFF = 'COMP_OFF',
  UNPAID = 'UNPAID',
}

export enum LeaveDurationType {
  FULL_DAY = 'FULL_DAY',
  HALF_DAY = 'HALF_DAY',
}

export enum LeaveRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity('leave_requests')
@Index('IDX_leave_requests_employee', ['employeeId'])
@Index('IDX_leave_requests_dates', ['startDate', 'endDate'])
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'varchar' })
  leaveType: string;

  @Column({ type: 'varchar', default: LeaveDurationType.FULL_DAY })
  durationType: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 1 })
  days: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', nullable: true })
  attachmentUrl: string | null;

  @Column({ type: 'uuid', nullable: true })
  approverUserId: string | null;

  @Column({ type: 'varchar', default: LeaveRequestStatus.APPROVED })
  status: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ default: false })
  notifyEmployee: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('leave_balances')
@Index('UQ_leave_balances_employee_year_type', ['employeeId', 'year', 'leaveType'], {
  unique: true,
})
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar' })
  leaveType: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 12 })
  entitledDays: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  usedDays: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
