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
import { User } from './user.entity';
import { DriverType } from './driver-type.enum';
import { AssignedDriver } from './vehicle.entity';

export { DriverType } from './driver-type.enum';

export enum DriverDocType {
  LICENSE = 'LICENSE',
  CNIC = 'CNIC',
  GURANTOR_CNIC = 'GURANTOR_CNIC',
  POLICE_VERIFICATION = 'POLICE_VERIFICATION',
  ELECTRICITY_BILL = 'ELECTRICITY_BILL',
  MOTERWAY_CARD = 'MOTERWAY_CARD',
  OTHER = 'OTHER',
}

export enum DriverLicenseType {
  HTV = 'HTV',
  LTV = 'LTV',
}

export enum DriverStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum EmployeerType {
  OWN = 'OWN',
  OTHER = 'OTHER',
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

  @Column({ type: 'varchar', nullable: true })
  joiningDate?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  fatherName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  altPhone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  cnicNo?: string | null;

  @Column({ type: 'varchar', nullable: true })
  licenseNo?: string | null;

  @Column({ type: 'boolean', default: false })
  licenseOnlineVerification: boolean;

  @Column({
    type: 'enum',
    enum: DriverLicenseType,
    nullable: true,
  })
  licenseType?: DriverLicenseType | null;

  @Column({ type: 'date', nullable: true })
  licenseValidity?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  currentAddress?: string | null;

  @Column({ type: 'varchar', nullable: true })
  permenantAddress?: string | null;

  @Column({ type: 'varchar', nullable: true })
  emergencyContactPhone?: string | null;

  // gurantor details
  @Column({ type: 'varchar', nullable: true })
  gurantorName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  gurantorPhone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  gurantorAddress?: string | null;

  @Column({ type: 'varchar', nullable: true })
  gurantorCNIC?: string | null;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.ACTIVE,
  })
  status: DriverStatus;

  @Column({ type: 'enum', enum: EmployeerType, default: EmployeerType.OWN })
  employeerType: EmployeerType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.driver, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => DriverDocument, (doc) => doc.driver)
  documents: DriverDocument[];

  @OneToMany(() => AssignedDriver, (assignedDriver) => assignedDriver.driver)
  assignedDrivers: AssignedDriver[];
}

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, (driver) => driver.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({
    type: 'enum',
    enum: DriverDocType,
  })
  docType: DriverDocType;

  @Column({ type: 'varchar', nullable: true })
  file?: string | null;

  @Column({ type: 'date', nullable: true })
  validity?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


