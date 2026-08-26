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

  @Column()
  companyName: string;

  @Column()
  companyAddress: string;

  @Column()
  postalCode: string;

  @Column()
  city: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  ntn: string;

  @Column({ unique: true })
  saleTaxNo: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

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

  @ManyToOne(() => Client, (client) => client.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @RelationId((clientContact: ClientContact) => clientContact.client)
  clientId: string;

  @Column()
  name: string;

  @Column()
  designation: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
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

  @ManyToOne(() => Client, (client) => client.pickupLocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @RelationId(
    (clientPickupLocation: ClientPickupLocation) => clientPickupLocation.client,
  )
  clientId: string;

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

@Entity('client_dropoff_locations')
export class ClientDropoffLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, (client) => client.dropoffLocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @RelationId(
    (clientDropoffLocation: ClientDropoffLocation) =>
      clientDropoffLocation.client,
  )
  clientId: string;

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
  @Column({ unique: true })
  file: string;

  @Column({ type: 'date' })
  validity: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
