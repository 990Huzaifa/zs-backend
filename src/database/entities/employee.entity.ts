import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from "typeorm";
import { User } from "./user.entity";

export enum Gender {
    MALE = 'MALE',
    FEMALE = 'FEMALE',
    OTHER = 'OTHER',
}

export enum MaritalStatus {
    SINGLE = 'SINGLE',
    MARRIED = 'MARRIED',
    DIVORCED = 'DIVORCED',
    WIDOWED = 'WIDOWED',
    SEPARATED = 'SEPARATED',
}
export enum EmployeeStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED',
    RESIGNED = 'RESIGNED',
}

export enum EmploymentType {
    PERMANENT = 'PERMANENT',
    CONTRACT = 'CONTRACT',
    PROBATION = 'PROBATION',
    PART_TIME = 'PART_TIME',
    DAILY_WAGE = 'DAILY_WAGE',
}

export enum AttendanceStatus {
    PRESENT = 'PRESENT',
    ABSENT = 'ABSENT',
    LATE = 'LATE',
    HALF_DAY = 'HALF_DAY',
    PAID_LEAVE = 'PAID_LEAVE',
    UNPAID_LEAVE = 'UNPAID_LEAVE',
    HOLIDAY = 'HOLIDAY',
    WEEK_OFF = 'WEEK_OFF',
}

export enum AttendanceSource {
    MANUAL = 'MANUAL',
    WEB = 'WEB',
    MOBILE = 'MOBILE',
    BIOMETRIC = 'BIOMETRIC',
}

@Entity('employees')
export class Employee {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @OneToOne(() => User, (user) => user.employee, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    firstName: string;

    @Column({
        type: 'enum',
        enum: Gender,
        default: Gender.MALE,
    })
    gender: Gender;

    @Column({
        type: 'enum',
        enum: MaritalStatus,
        default: MaritalStatus.SINGLE,
    })
    maritalStatus: MaritalStatus;

    @Column({ type: 'varchar', nullable: true })
    dateOfBirth?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    joiningDate?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    phone?: string | null;

    @Column({ type: 'varchar', nullable: true })
    altPhone?: string | null;

    @Column({ type: 'varchar', nullable: true })
    cnicNo?: string | null;

    @Column({ type: 'varchar', nullable: true })
    address?: string | null;

    @Column({ type: 'varchar', nullable: true })
    city?: string | null;

    @Column({ type: 'varchar', nullable: true })
    state?: string | null;

    @Column({ type: 'varchar', nullable: true })
    zip?: string | null;

    @Column({ type: 'varchar', nullable: true })
    photograph?: string | null;

    @Column({ type: 'varchar', nullable: true })
    designation?: string | null;

    @Column({
        type: 'enum',
        enum: EmployeeStatus,
        default: EmployeeStatus.ACTIVE,
    })
    status: EmployeeStatus;

    // bank details
    @Column({ type: 'varchar', nullable: true })
    bankName?: string | null;
    @Column({ type: 'varchar', nullable: true })
    bankAccountNumber?: string | null;
    @Column({ type: 'varchar', nullable: true })
    bankAccountTitle?: string | null;

    // emergency contact
    @Column({ type: 'varchar', nullable: true })
    emergencyContactName?: string | null;
    @Column({ type: 'varchar', nullable: true })
    emergencyContactPhone?: string | null;
    @Column({ type: 'varchar', nullable: true })
    emergencyContactRelation?: string | null;


    @Column({ type: 'varchar', nullable: true })
    taxNumber?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('employee_attendance')
@Unique(['employeeId', 'attendanceDate'])
export class EmployeeAttendance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    employeeId: string;

    @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employeeId' })
    employee: Employee;

    @Column({ type: 'date' })
    attendanceDate: Date;

    @Column({
        type: 'enum',
        enum: AttendanceStatus,
    })
    status: AttendanceStatus;

    @Column({ type: 'timestamp', nullable: true })
    checkIn?: Date;

    @Column({ type: 'timestamp', nullable: true })
    checkOut?: Date;

    @Column({ type: 'int', nullable: true })
    workedMinutes?: number;

    @Column({ type: 'int', default: 0 })
    lateMinutes: number;

    @Column({ type: 'int', default: 0 })
    overtimeMinutes: number;

    @Column({ type: 'int', default: 0 })
    earlyLeaveMinutes: number;

    @Column({ nullable: true })
    remarks?: string;

    @Column({
        type: 'enum',
        enum: AttendanceSource,
        default: AttendanceSource.MANUAL,
    })
    source: AttendanceSource;

    @Column({ type: 'uuid', nullable: true })
    markedById?: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'markedById' })
    markedBy?: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}