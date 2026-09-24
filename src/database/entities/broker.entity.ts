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

export enum BrokerStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

@Entity('brokers')
export class Broker {
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

    @Column({ type: 'enum', enum: BrokerStatus, default: BrokerStatus.ACTIVE })
    status: BrokerStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => BrokerContact, (contact) => contact.broker)
    contacts: BrokerContact[];

    @OneToMany(() => BrokerDocument, (document) => document.broker)
    documents: BrokerDocument[];
}


@Entity('broker_contacts')
export class BrokerContact {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    brokerId: string;

    @ManyToOne(() => Broker, (broker) => broker.contacts, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'brokerId' })
    broker: Broker;

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


@Entity('broker_documents')
export class BrokerDocument {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    brokerId: string;

    @ManyToOne(() => Broker, (broker) => broker.documents, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'brokerId' })
    broker: Broker;

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