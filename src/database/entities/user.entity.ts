import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserAuthProvider } from './user-auth-provider.entity';
import { Activity } from './activity.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { Role } from './role.entity';
import { Driver } from './driver.entity';
import { Employee } from './employee.entity';

export enum ProfileType {
  USER = 'USER',
  DRIVER = 'DRIVER',
  BROKER = 'BROKER',
  COMPANY_USER = 'COMPANY_USER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @ManyToOne(() => Role, (role) => role.users, {
    nullable: false,
  })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @Column()
  roleId: string;

  @Column({
    type: 'enum',
    enum: ProfileType,
  })
  profileType: ProfileType;

  @Column()
  name: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  password?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatar?: string | null;

  @Column({ type: 'varchar', nullable: true })
  deviceId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  fcmToken?: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', nullable: true })
  appVersion?: string | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;

  @OneToMany(() => UserAuthProvider, (auth) => auth.user)
  authProviders: UserAuthProvider[];

  @OneToMany(() => Activity, (activity) => activity.user)
  activities: Activity[];

  @OneToMany(() => PasswordResetToken, (token) => token.user)
  passwordResetTokens: PasswordResetToken[];

  @OneToOne(() => Driver, (driver) => driver.user)
  driver: Driver;

  @OneToOne(() => Employee, (employee) => employee.user)
  employee: Employee;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
