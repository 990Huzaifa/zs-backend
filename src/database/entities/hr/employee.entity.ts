import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, Unique, OneToMany } from "typeorm";
import { User } from "../user.entity";

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

    @Column({ type: 'varchar', nullable: true })
    designation?: string | null;

    @Column({ type: 'uuid', nullable: true })
    departmentId?: string | null;

    @ManyToOne(() => Department, (department) => department.employees, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'departmentId' })
    department?: Department | null;

    @Column({ default: true })
    attendanceEnabled: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('departments')
export class Department {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    name: string;

    @OneToMany(() => Employee, (employee) => employee.department)
    employees: Employee[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}