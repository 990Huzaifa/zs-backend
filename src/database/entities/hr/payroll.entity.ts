import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SalaryVoucher } from '../salary-voucher.entity';
import { User } from '../user.entity';
import { Employee } from './employee.entity';

export enum PayType {
  MONTHLY = 'MONTHLY',
  DAILY = 'DAILY',
  HOURLY = 'HOURLY',
}

export enum PayPeriodStatus {
  OPEN = 'OPEN',
  LOCKED = 'LOCKED',
  CLOSED = 'CLOSED',
}

export enum PayrollRunStatus {
  DRAFT = 'DRAFT',
  CALCULATED = 'CALCULATED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum PayslipStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('employee_salaries')
@Index(['employeeId', 'effectiveFrom'])
export class EmployeeSalary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'enum', enum: PayType, default: PayType.MONTHLY })
  payType: PayType;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  basicSalary: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  houseAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  transportAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  mobileAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  mealAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  otherAllowance: number;

  /** Used when converting overtime minutes to amount */
  @Column({ type: 'decimal', precision: 20, scale: 2, nullable: true })
  overtimeRatePerHour: number | null;

  @Column({ type: 'date' })
  effectiveFrom: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('pay_periods')
@Index(['startDate', 'endDate'], { unique: true })
export class PayPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: PayPeriodStatus,
    default: PayPeriodStatus.OPEN,
  })
  status: PayPeriodStatus;

  @OneToMany(() => PayrollRun, (run) => run.payPeriod)
  payrollRuns: PayrollRun[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('payroll_runs')
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payPeriodId: string;

  @ManyToOne(() => PayPeriod, (period) => period.payrollRuns, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payPeriodId' })
  payPeriod: PayPeriod;

  @Column({
    type: 'enum',
    enum: PayrollRunStatus,
    default: PayrollRunStatus.DRAFT,
  })
  status: PayrollRunStatus;

  @Column({ type: 'timestamptz', nullable: true })
  calculatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'approvedBy' })
  approvedByUser: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => Payslip, (payslip) => payslip.payrollRun)
  payslips: Payslip[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('payslips')
@Index(['payrollRunId', 'employeeId'], { unique: true })
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payrollRunId: string;

  @ManyToOne(() => PayrollRun, (run) => run.payslips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRunId' })
  payrollRun: PayrollRun;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  /** Salary structure used when this slip was calculated */
  @Column({ type: 'uuid', nullable: true })
  employeeSalaryId: string | null;

  @ManyToOne(() => EmployeeSalary, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'employeeSalaryId' })
  employeeSalary: EmployeeSalary | null;

  // --- Earnings snapshot (locked at calculation time) ---

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  basicSalary: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  houseAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  transportAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  mobileAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  mealAllowance: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  otherAllowance: number;

  @Column({ type: 'int', default: 0 })
  overtimeMinutes: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  overtimeAmount: number;

  // --- Attendance summary for the period ---

  @Column({ type: 'int', default: 0 })
  presentDays: number;

  @Column({ type: 'int', default: 0 })
  absentDays: number;

  @Column({ type: 'int', default: 0 })
  unpaidLeaveDays: number;

  @Column({ type: 'int', default: 0 })
  paidLeaveDays: number;

  @Column({ type: 'int', default: 0 })
  holidayDays: number;

  @Column({ type: 'int', default: 0 })
  workedMinutes: number;

  @Column({ type: 'int', default: 0 })
  lateMinutes: number;

  @Column({ type: 'int', default: 0 })
  shortfallMinutes: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  attendanceDeductionAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  otherDeductionAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  grossAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  netAmount: number;

  @Column({
    type: 'enum',
    enum: PayslipStatus,
    default: PayslipStatus.DRAFT,
  })
  status: PayslipStatus;

  @Column({ type: 'uuid', nullable: true })
  salaryVoucherId: string | null;

  @ManyToOne(() => SalaryVoucher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'salaryVoucherId' })
  salaryVoucher: SalaryVoucher | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
