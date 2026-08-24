import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum ChartOfAccountKind {
  SYSTEM = 'SYSTEM',
  BUSINESS = 'BUSINESS',
  PARTY_RECEIVABLE = 'PARTY_RECEIVABLE',
  PARTY_PAYABLE = 'PARTY_PAYABLE',
  EMPLOYEE_SALARY_PAYABLE = 'EMPLOYEE_SALARY_PAYABLE',
}

@Entity('chart_of_accounts')
export class ChartOfAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({
    type: 'enum',
    enum: ChartOfAccountKind,
    default: ChartOfAccountKind.SYSTEM,
  })
  accountKind: ChartOfAccountKind;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  parentCode: string | null;

  @Column({ type: 'boolean', default: true })
  isPostable: boolean;

  @Column({ default: 0 })
  level1: number;

  @Column({ default: 0 })
  level2: number;

  @Column({ default: 0 })
  level3: number;

  @Column({ default: 0 })
  level4: number;

  @Column({ default: 0 })
  level5: number;

  @Column({ default: 0 })
  level6: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}

export type AccountCodeLevels = Pick<
  ChartOfAccount,
  'level1' | 'level2' | 'level3' | 'level4' | 'level5' | 'level6'
>;
