import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
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
    ON_LEAVE = 'ON_LEAVE',
    TERMINATED = 'TERMINATED',
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