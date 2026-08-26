import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum DriverDocType {
  LICENSE = 'LICENSE',
  CNIC = 'CNIC',
  OTHER = 'OTHER',
}

export enum DriverType {
  HELPER = 'HELPER',
  FIRST_DRIVER = 'FIRST_DRIVER',
  SECOND_DRIVER = 'SECOND_DRIVER',
}

export enum DriverLicenseType {
  HTV = 'HTV',
  LTV = 'LTV',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: DriverType,
  })
  driverType: DriverType;

  @Column()
  fatherName: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  altPhone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  licenseNo?: string | null;

  @Column({
    type: 'enum',
    enum: DriverLicenseType,
  })
  licenseType: DriverLicenseType;

  @Column({ type: 'varchar', nullable: true })
  currentAddress?: string | null;

  @Column({ type: 'varchar', nullable: true })
  permenantAddress?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;
}

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({
    type: 'enum',
    enum: DriverDocType,
  })
  docType: DriverDocType;

  @Column({ unique: true })
  file: string;

  @Column({ type: 'date' })
  validity: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
