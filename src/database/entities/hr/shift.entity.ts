import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Employee } from "./employee.entity";

@Entity('break_policies')
export class BreakPolicy {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'int' })
    allowedMinutes: number;

    @Column({ type: 'time' })
    windowStart: string;

    @Column({ type: 'time' })
    windowEnd: string;

    @Column({ default: true })
    allowMultipleBreaks: boolean;

    @Column({ default: true })
    paid: boolean;

    @Column({ default: true })
    excessDeductible: boolean;
}

@Entity('shifts')
export class Shift {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'time' })
    endTime: string;

    @Column({ type: 'int' })
    requiredWorkMinutes: number;

    @Column({ type: 'int', default: 0 })
    graceMinutes: number;

    @Column({ type: 'uuid' })
    breakPolicyId: string;

    @ManyToOne(() => BreakPolicy)
    @JoinColumn({ name: 'breakPolicyId' })
    breakPolicy: BreakPolicy;

    @Column({ default: true })
    isActive: boolean;
}

@Entity('shift_assignments')
export class ShiftAssignment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    employeeId: string;

    @ManyToOne(() => Employee)
    @JoinColumn({ name: 'employeeId' })
    employee: Employee;

    @Column({ type: 'uuid' })
    shiftId: string;

    @ManyToOne(() => Shift)
    @JoinColumn({ name: 'shiftId' })
    shift: Shift;

    @Column({ type: 'date' })
    workDate: string;

    @Column({ type: 'timestamptz' })
    scheduledStartAt: Date;

    @Column({ type: 'timestamptz' })
    scheduledEndAt: Date;

    @Column({ type: 'jsonb' })
    policySnapshot: Record<string, unknown>;
}
