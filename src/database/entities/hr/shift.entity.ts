import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

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
