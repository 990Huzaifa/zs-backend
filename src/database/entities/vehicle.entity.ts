import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';


export enum VehicleOwnerShip{
  CONTRACT_BASED = "CONTRACT_BASED",
  BANK_LEASE = "BANK_LEASE",
  OWN = "OWN",
}

export enum VehicleTypeMeasurement{
  SIZE = "SIZE",
  CAPACITY = "CAPACITY"
}

export enum VehicleDocType{
  CERTIFICATE_OF_FITNESS = "CERTIFICATE_OF_FITNESS",
  TAX_CERTIFICATE = "TAX_CERTIFICATE",
  ROUTE_PERMIT = "ROUTE_PERMIT",
  REGISTERATION = "REGISTERATION"
}

export enum VehicleStatus{
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum Designation{
  DRIVER = "DRIVER",
  OWNER = "OWNER",
  FORMEN = "FORMEN",
  OFFICE_PERSON = "OFFICE_PERSON"
}


@Entity('vehicle_sizes')
export class vehicleSize{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({unique: true})
  slug: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_capacity')
export class vehicleCapacity{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({unique: true})
  slug: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_types')
export class vehicleType{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({unique: true})
  slug: string;

  @Column({
    type: 'enum',
    enum: VehicleTypeMeasurement,
  })
  measurement: VehicleTypeMeasurement;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  //  owner detail
  @Column({
    type: 'enum',
    enum: VehicleOwnerShip
  })
  ownership: VehicleOwnerShip;

  @Column()
  ownerFirstName: string;

  @Column()
  ownerLastName: string;

  // contact details

  @Column()
  contactPersonName: string;

  @Column()
  contactNo: string;

  @Column({
    type: 'enum',
    enum: Designation
  })
  Designation: Designation;

  // vehicle info

  @Column()
  regNo: string;

  @Column()
  enginNo: string;

  @Column()
  chassisNo: string;

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    default: VehicleStatus.ACTIVE
  })
  status: VehicleStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('vehicle_documents')
export class vehicleDocuments{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({nullable: true})
  name?: string | null;

  @Column({
    type: 'enum',
    enum: VehicleDocType
  })
  docType: VehicleDocType;

  @Column({unique: true})
  file: string;

  @Column()
  validity: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
