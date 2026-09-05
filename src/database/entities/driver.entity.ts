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
import { Vehicle } from './vehicle.entity';

export enum DriverDocType {
  LICENSE = 'LICENSE',
  CNIC = 'CNIC',
  GURANTOR_CNIC = 'GURANTOR_CNIC',
  POLICE_VERIFICATION = 'POLICE_VERIFICATION',
  ELECTRICITY_BILL = 'ELECTRICITY_BILL',
  MOTERWAY_CARD = 'MOTERWAY_CARD',
  OTHER = 'OTHER',
}

export enum DriverType {
  HELPER = 'HELPER',
  FIRST_DRIVER = '1ST_DRIVER',
  SECOND_DRIVER = '2ND_DRIVER',
}

export enum DriverLicenseType {
  HTV = 'HTV',
  LTV = 'LTV',
}

export enum DriverStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AssignedVehicleStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
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

  @Column()
  fatherName: string;

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
  })
  licenseType: DriverLicenseType;

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

  /** S3 object key */
  @Column({ type: 'varchar', nullable: true })
  avatar?: string | null;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.ACTIVE,
  })
  status: DriverStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.driver, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => DriverDocument, (doc) => doc.driver)
  documents: DriverDocument[];

  @OneToMany(() => AssignedVehicle, (av) => av.driver)
  assignedVehicles: AssignedVehicle[];
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

@Entity('assigned_vehicles')
export class AssignedVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, (driver) => driver.assignedVehicles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => Vehicle, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: Vehicle;

  @Column({ type: 'varchar', nullable: true })
  assignedDate?: Date | null;

  @Column({
    type: 'enum',
    enum: AssignedVehicleStatus,
    default: AssignedVehicleStatus.PENDING,
  })
  status: AssignedVehicleStatus;

  // assigned-by info
  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
