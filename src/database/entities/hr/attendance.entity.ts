import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { Employee } from "./employee.entity";
import { ShiftAssignment } from "./shift.entity";


export enum AttendanceEventType {
    CHECK_IN = 'CHECK_IN',
    CHECK_OUT = 'CHECK_OUT',
}

export enum CheckOutReason {
    BREAK = 'BREAK',
    PERSONAL = 'PERSONAL',
    OFFICIAL_DUTY = 'OFFICIAL_DUTY',
    SHIFT_END = 'SHIFT_END',
}

export enum AttendanceSource {
    MOBILE = 'MOBILE',
    BIOMETRIC = 'BIOMETRIC',
    ADMIN = 'ADMIN',
    SYSTEM = 'SYSTEM',
}

export enum SessionType {
    WORK = 'WORK',
    BREAK = 'BREAK',
    PERSONAL = 'PERSONAL',
    OFFICIAL_DUTY = 'OFFICIAL_DUTY',
}
export enum AttendanceStatus {
    PRESENT = 'PRESENT',
    ABSENT = 'ABSENT',
    HALF_DAY = 'HALF_DAY',
    ON_LEAVE = 'ON_LEAVE',
    HOLIDAY = 'HOLIDAY',
    WEEKLY_OFF = 'WEEKLY_OFF',
    INCOMPLETE = 'INCOMPLETE',
}

export enum CalculationStatus {
    OPEN = 'OPEN',
    CALCULATED = 'CALCULATED',
    PROVISIONAL = 'PROVISIONAL',
    FINALIZED = 'FINALIZED',
}

@Entity('attendances')
@Index(['shiftAssignmentId'], { unique: true })
export class Attendance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    employeeId: string;

    @ManyToOne(() => Employee)
    @JoinColumn({ name: 'employeeId' })
    employee: Employee;

    @Column({ type: 'uuid' })
    shiftAssignmentId: string;

    @OneToOne(() => ShiftAssignment)
    @JoinColumn({ name: 'shiftAssignmentId' })
    shiftAssignment: ShiftAssignment;

    @Column({ type: 'date' })
    attendanceDate: string;

    @Column({ type: 'timestamptz', nullable: true })
    firstCheckIn: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    lastCheckOut: Date | null;

    @Column({ type: 'int', default: 0 })
    workedMinutes: number;

    @Column({ type: 'int', default: 0 })
    allowedBreakMinutes: number;

    @Column({ type: 'int', default: 0 })
    excessBreakMinutes: number;

    @Column({ type: 'int', default: 0 })
    lateMinutes: number;

    @Column({ type: 'int', default: 0 })
    earlyLeaveMinutes: number;

    @Column({ type: 'int', default: 0 })
    shortfallMinutes: number;

    @Column({ type: 'int', default: 0 })
    overtimeMinutes: number;

    @Column({ type: 'int', default: 0 })
    provisionalDeductionMinutes: number;

    @Column()
    status: string;

    @Column()
    calculationStatus: string;

    @Column({ type: 'int', default: 1 })
    calculationVersion: number;
}

@Entity('attendance_events')
export class AttendanceEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    attendanceId: string;

    @ManyToOne(() => Attendance)
    @JoinColumn({ name: 'attendanceId' })
    attendance: Attendance;

    @Column({ type: 'enum', enum: AttendanceEventType })
    type: AttendanceEventType;

    @Column({
        type: 'enum',
        enum: CheckOutReason,
        nullable: true,
    })
    reason: CheckOutReason | null;

    @Column({ type: 'timestamptz' })
    occurredAt: Date;

    @Column({ type: 'timestamptz' })
    receivedAt: Date;

    @Column({ type: 'enum', enum: AttendanceSource })
    source: AttendanceSource;

    @Column({ type: 'varchar', nullable: true })
    deviceId: string | null;

    @Column({ type: 'varchar', nullable: true, unique: true })
    idempotencyKey: string | null;

    @Column({ type: 'uuid', nullable: true })
    createdBy: string | null;
}

@Entity('attendance_sessions')
export class AttendanceSession {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    attendanceId: string;

    @ManyToOne(() => Attendance)
    @JoinColumn({ name: 'attendanceId' })
    attendance: Attendance;

    @Column({ type: 'enum', enum: SessionType })
    type: SessionType;

    @Column({ type: 'timestamptz' })
    startAt: Date;

    @Column({ type: 'timestamptz' })
    endAt: Date;

    @Column({ type: 'int' })
    durationMinutes: number;

    @Column({ type: 'int', default: 0 })
    eligibleMinutes: number;
}

@Entity('attendance_adjustments')
export class AttendanceAdjustment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    attendanceId: string;

    @Column({ type: 'uuid', nullable: true })
    originalEventId: string | null;

    @Column({ type: 'jsonb', nullable: true })
    oldValue: Record<string, unknown> | null;

    @Column({ type: 'jsonb' })
    newValue: Record<string, unknown>;

    @Column({ type: 'text' })
    reason: string;

    @Column({ type: 'uuid' })
    requestedBy: string;

    @Column({ type: 'uuid', nullable: true })
    approvedBy: string | null;

    @Column()
    status: string;
}