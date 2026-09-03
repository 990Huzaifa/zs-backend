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
import {
    Client,
    ClientDropoffLocation,
    ClientPickupLocation,
} from './client.entity';
import { Driver } from './driver.entity';
import { User } from './user.entity';
import { Vehicle } from './vehicle.entity';

export enum BiltyStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    CANCELLED = 'CANCELLED',
    COMPLETED = 'COMPLETED',
}

@Entity('bilty')
export class Bilty {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', unique: true })
    code: string;

    @Column({ type: 'date' })
    issueDate: Date;

    @Column({ type: 'uuid' })
    driverId: string;

    @ManyToOne(() => Driver, { nullable: false })
    @JoinColumn({ name: 'driverId' })
    driver: Driver;

    @Column({ type: 'uuid', nullable: true })
    vehicleId?: string | null;

    @ManyToOne(() => Vehicle, { nullable: true })
    @JoinColumn({ name: 'vehicleId' })
    vehicle?: Vehicle | null;

    @Column({ type: 'varchar', nullable: true })
    vehicleRegistrationNumber?: string | null;

    @Column()
    description: string;

    @Column({ type: 'varchar', nullable: true })
    refNumber: string | null;

    @Column({ type: 'varchar', nullable: true })
    totalWeight: string | null;

    @Column({ type: 'varchar', nullable: true })
    noOfPackages: string | null;

    @Column({ type: 'varchar', nullable: true })
    transaportorName: string | null;

    @Column({ type: 'varchar', nullable: true })
    transaportorPhone: string | null;

    @Column({ type: 'uuid', nullable: true })
    createdById: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'createdById' })
    createdBy: User | null;

    @Column({
        type: 'enum',
        enum: BiltyStatus,
        default: BiltyStatus.PENDING,
    })
    status: BiltyStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => BiltyLoading, (loading) => loading.bilty, {
        cascade: true,
    })
    loadings: BiltyLoading[];

    @OneToMany(() => BiltyOffLoading, (offLoading) => offLoading.bilty, {
        cascade: true,
    })
    offLoadings: BiltyOffLoading[];
}

@Entity('bilty_loadings')
export class BiltyLoading {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, (bilty) => bilty.loadings, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'biltyId' })
    bilty: Bilty;

    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, { nullable: false })
    @JoinColumn({ name: 'clientId' })
    client: Client;

    @Column({ type: 'date' })
    loadingDate: Date;

    @Column({ type: 'timestamp', nullable: true })
    arrivalDate: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    loadingTimeIn: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    loadingTimeOut: Date | null;

    @Column({ type: 'uuid' })
    pickupLocationId: string;

    @ManyToOne(() => ClientPickupLocation, { nullable: false })
    @JoinColumn({ name: 'pickupLocationId' })
    pickupLocation: ClientPickupLocation;

    @Column({ type: 'varchar', nullable: true })
    loadingContactName: string | null;

    @Column({ type: 'varchar', nullable: true })
    loadingContactPhone: string | null;

    @Column({ type: 'integer', nullable: true })
    noOfLoadingStops: number | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('bilty_off_loadings')
export class BiltyOffLoading {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, (bilty) => bilty.offLoadings, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'biltyId' })
    bilty: Bilty;

    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, { nullable: false })
    @JoinColumn({ name: 'clientId' })
    client: Client;

    @Column({ type: 'date' })
    offLoadingDate: Date;

    @Column({ type: 'timestamp', nullable: true })
    offLoadingTimeIn: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    offLoadingTimeOut: Date | null;

    @Column({ type: 'uuid' })
    dropoffLocationId: string;

    @ManyToOne(() => ClientDropoffLocation, { nullable: false })
    @JoinColumn({ name: 'dropoffLocationId' })
    dropoffLocation: ClientDropoffLocation;

    @Column({ type: 'varchar', nullable: true })
    offLoadingContactName: string | null;

    @Column({ type: 'varchar', nullable: true })
    offLoadingContactPhone: string | null;

    @Column({ type: 'integer', nullable: true })
    noOfOffLoadingStops: number | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
