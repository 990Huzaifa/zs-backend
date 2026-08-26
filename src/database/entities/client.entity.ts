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

@Entity('client_types')
export class ClientType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // company info

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('client_contacts')
export class ClientContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, (client) => client.contacts)
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

  @ManyToOne(() => Client, (client) => client.pickupLocations)
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

  // contact info
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

  @ManyToOne(() => Client, (client) => client.dropoffLocations)
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

  // contact info
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
