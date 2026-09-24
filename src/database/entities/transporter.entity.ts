import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { City } from './city.entity';
import { State } from './state.entity';

export enum TranspoterStatus{
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('transporters')
export class Transporter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  companyName: string;

  @Column({ type: 'varchar', length: 255 })
  ownerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ntn?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lat?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lng?: string | null;

  @Column({ type: 'int' })
  stateId: number;

  @ManyToOne(() => State, (state) => state.vendors, { nullable: false })
  @JoinColumn({ name: 'stateId' })
  state: State;

  @Column({ type: 'int' })
  cityId: number;

  @ManyToOne(() => City, (city) => city.vendors, { nullable: false })
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ type: 'varchar', nullable: true })
  zipCode?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar?: string | null;

  @Column({ type: 'enum', enum: TranspoterStatus, default: TranspoterStatus.ACTIVE })
  status: TranspoterStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TransporterContact, (contact) => contact.transporter)
  contacts: TransporterContact[];

  @OneToMany(() => TransporterDocument, (document) => document.transporter)
  documents: TransporterDocument[];
}


@Entity('transporter_contacts')
export class TransporterContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transporterId: string;

  @ManyToOne(() => Transporter, (transporter) => transporter.contacts, {
      onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transporterId' })
  transporter: Transporter;

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


@Entity('transporter_documents')
export class TransporterDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transporterId: string;

  @ManyToOne(() => Transporter, (transporter) => transporter.documents, {
      onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transporterId' })
  transporter: Transporter;

  @Column({ type: 'varchar', nullable: true })
  name?: string | null;
  
  @Column({ type: 'varchar', nullable: true })
  file?: string | null;

  @Column({ type: 'date', nullable: true })
  validity?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}