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
}

export enum VehicleTypeMeasurement {
  SIZE = 'SIZE',
  CAPACITY = 'CAPACITY',
}

export enum VehicleDocType {
  CERTIFICATE_OF_FITNESS = 'CERTIFICATE_OF_FITNESS',
  TAX_CERTIFICATE = 'TAX_CERTIFICATE',
  ROUTE_PERMIT = 'ROUTE_PERMIT',
  REGISTERATION = 'REGISTERATION',
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_documents')
export class VehicleDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({
    type: 'enum',
    enum: VehicleDocType,
  })
  docType: VehicleDocType;

  @Column({ unique: true })
  file: string;

  @Column({ type: 'date' })
  validity: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


