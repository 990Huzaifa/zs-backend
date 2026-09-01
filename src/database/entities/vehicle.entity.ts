import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VehicleOwnerShip {
  CONTRACT_BASED = 'CONTRACT_BASED',
  BANK_LEASE = 'BANK_LEASE',
  OWN = 'OWN',
  RENTED = 'RENTED',
}

export enum VehicleTypeMeasurement {
  SIZE = 'SIZE',
  CAPACITY = 'CAPACITY',
}

export enum VehicleDocType {
  INSURANCE_CERTIFICATE = 'INSURANCE_CERTIFICATE',
  REGISTRATION_CARD = 'REGISTRATION_CARD',
  REGISTRATION_BOOK = 'REGISTRATION_BOOK',
  CERTIFICATE_OF_FITNESS = 'CERTIFICATE_OF_FITNESS',
  TAX_CERTIFICATE = 'TAX_CERTIFICATE',
  ROUTE_PERMIT = 'ROUTE_PERMIT',
  REGISTERATION = 'REGISTERATION',
  POLICE_VERIFICATION = 'POLICE_VERIFICATION',
  TRACKER_CERTIFICATE = 'TRACKER_CERTIFICATE',
  THIRD_PARTY_CERTIFICATE = 'THIRD_PARTY_CERTIFICATE',
  OTHER = 'OTHER',
}

export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum Designation {
  DRIVER = 'DRIVER',
  OWNER = 'OWNER',
  FORMEN = 'FORMEN',
  OFFICE_PERSON = 'OFFICE_PERSON',
}

@Entity('vehicle_sizes')
export class VehicleSize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.vehicleSize)
  vehicles: Vehicle[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_capacity')
export class VehicleCapacity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.vehicleCapacity)
  vehicles: Vehicle[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_types')
export class VehicleType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: VehicleTypeMeasurement,
  })
  measurement: VehicleTypeMeasurement;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Vehicle, (vehicle) => vehicle.vehicleType)
  vehicles: Vehicle[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: VehicleOwnerShip,
  })
  ownership: VehicleOwnerShip;

  @Column()
  ownerFirstName: string;

  @Column()
  ownerLastName: string;

  @Column({ type: 'varchar', nullable: true })
  joiningDate?: Date | null;

  @Column()
  contactPersonName: string;

  @Column()
  contactNo: string;

  @Column({
    type: 'enum',
    enum: Designation,
  })
  Designation: Designation;

  @Column()
  regNo: string;

  @Column()
  enginNo: string;

  @Column()
  chassisNo: string;

  /** S3 object keys for vehicle photos */
  @Column({ type: 'jsonb', nullable: true })
  vehicleImages?: string[] | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleTypeId?: string | null;

  @ManyToOne(() => VehicleType, (type) => type.vehicles, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vehicleTypeId' })
  vehicleType?: VehicleType | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleSizeId?: string | null;

  @ManyToOne(() => VehicleSize, (size) => size.vehicles, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vehicleSizeId' })
  vehicleSize?: VehicleSize | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleCapacityId?: string | null;

  @ManyToOne(() => VehicleCapacity, (capacity) => capacity.vehicles, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vehicleCapacityId' })
  vehicleCapacity?: VehicleCapacity | null;

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    default: VehicleStatus.ACTIVE,
  })
  status: VehicleStatus;

  @OneToMany(() => VehicleDocument, (doc) => doc.vehicle)
  documents: VehicleDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_documents')
export class VehicleDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: Vehicle;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({
    type: 'enum',
    enum: VehicleDocType,
  })
  docType: VehicleDocType;

  /** S3 object key */
  @Column({ type: 'varchar', nullable: true })
  file?: string | null;

  @Column({ type: 'date', nullable: true })
  validity?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


