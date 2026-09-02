import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { TaxRule } from './tax-rule.entity';
import { City } from './city.entity';
import { Warehouse } from './warehouse.entity';
import { VehicleCapacity, VehicleSize, VehicleType } from './vehicle.entity';
import { VendorProduct } from './vendor.entity';

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ClientDocType {
  NTN = 'NTN',
  SALES_TAX_CERTIFICATE = 'SALES_TAX_CERTIFICATE',
  AGREEMENT = 'AGREEMENT',
  OTHER = 'OTHER',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  joiningDate?: Date | null;

  @Column()
  companyName: string;

  @Column()
  companyAddress: string;

  @Column()
  postalCode: string;

  @Column({ type: 'int' })
  cityId: number;

  @ManyToOne(() => City, (city) => city.clients, { nullable: false })
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  ntn: string;

  @Column({ unique: true })
  saleTaxNo: string;

  @Column({ type: 'varchar', nullable: true })
  ptclNo?: string | null;

  @Column({
    type: 'enum',
    enum: ClientStatus,
    default: ClientStatus.ACTIVE,
  })
  status: ClientStatus;

  /** Linked tax rules (sale tax types). IDs also available via `saleTaxTypeIds`. */
  @ManyToMany(() => TaxRule, (taxRule) => taxRule.clients)
  @JoinTable({
    name: 'client_sale_tax_types',
    joinColumn: {
      name: 'clientId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'taxRuleId',
      referencedColumnName: 'id',
    },
  })
  saleTaxTypes: TaxRule[];

  @RelationId((client: Client) => client.saleTaxTypes)
  saleTaxTypeIds: string[];

  //  tax status: true means included, false means excluded
  @Column({ default: false })
  saleTaxStatus: boolean;

  //  tax status: true means included, false means excluded
  @Column({ default: false })
  withHoldingTaxStatus: boolean;

  //  warehouse owner: true means warehouse owner, false means not warehouse owner. he owns the warehouse.
  @Column({ default: false })
  isWarehouseOwner: boolean;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.client)
  warehouses: Warehouse[];

  @OneToMany(() => ClientContact, (clientContact) => clientContact.client)
  contacts: ClientContact[];

  @OneToMany(
    () => ClientPickupLocation,
    (clientPickupLocation) => clientPickupLocation.client,
  )
  pickupLocations: ClientPickupLocation[];

  @OneToMany(
    () => ClientDropoffLocation,
    (clientDropoffLocation) => clientDropoffLocation.client,
  )
  dropoffLocations: ClientDropoffLocation[];

  @OneToMany(() => ClientDocument, (doc) => doc.client)
  documents: ClientDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('client_contacts')
export class ClientContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  name: string;

  @Column()
  designation: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  /** Unique per client when set (not globally) */
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column()
  phone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('client_pickup_locations')
export class ClientPickupLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.pickupLocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column({ type: 'varchar', nullable: true })
  lat: string | null;

  @Column({ type: 'varchar', nullable: true })
  lng: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPersonName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPersonPhone?: string | null;

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.ACTIVE })
  status: ClientStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.pickupLocation)
  warehouses: Warehouse[];
}

@Entity('client_dropoff_locations')
export class ClientDropoffLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.dropoffLocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column({ type: 'varchar', nullable: true })
  lat: string | null;

  @Column({ type: 'varchar', nullable: true })
  lng: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPersonName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPersonPhone?: string | null;

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.ACTIVE })
  status: ClientStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('client_documents')
export class ClientDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;

  @Column({
    type: 'enum',
    enum: ClientDocType,
  })
  docType: ClientDocType;

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

@Entity('client_rates')
export class ClientRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  // vehicle type + size or capacity (based on type measurement)
  @Column({ type: 'uuid' })
  vehicleTypeId: string;

  @ManyToOne(() => VehicleType, (vehicleType) => vehicleType.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicleTypeId' })
  vehicleType: VehicleType;

  @Column({ type: 'uuid', nullable: true })
  vehicleSizeId?: string | null;

  @ManyToOne(() => VehicleSize, (vehicleSize) => vehicleSize.id, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'vehicleSizeId' })
  vehicleSize?: VehicleSize | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleCapacityId?: string | null;

  @ManyToOne(() => VehicleCapacity, (vehicleCapacity) => vehicleCapacity.id, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'vehicleCapacityId' })
  vehicleCapacity?: VehicleCapacity | null;


  @Column({ type: 'int' })
  cityId: number;

  @ManyToOne(() => City, { nullable: false })
  @JoinColumn({ name: 'cityId' })
  city: City;
  
  // pricing details
  
  @Column({type: 'uuid'})
  vendorProductId: string;

  @ManyToOne(() => VendorProduct, (vendorProduct) => vendorProduct.id, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vendorProductId' })
  vendorProduct: VendorProduct;

  @Column({type: 'decimal', precision: 10, scale: 2})
  fuelrate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fixedrate: string;

  @Column({type: 'decimal', precision: 10, scale: 2})
  variablerate: string;

  @Column({type: 'decimal', precision: 10, scale: 2})
  freightrate: string;

  @Column({ type: 'date', nullable: true })
  effectiveFromDate?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClientRateLog, (log) => log.clientRate)
  logs: ClientRateLog[];
}

@Entity('client_rate_logs')
export class ClientRateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientRateId: string;

  @ManyToOne(() => ClientRate, (clientRate) => clientRate.logs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientRateId' })
  clientRate: ClientRate;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  previousPrice?: string | null;

  @Column({ type: 'date', nullable: true })
  effectiveFromDate?: Date | null;

  @Column({ type: 'date', nullable: true })
  effectiveToDate?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}