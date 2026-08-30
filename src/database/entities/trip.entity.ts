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
import { Bilty } from './bilty.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { Client } from './client.entity';
import { Driver } from './driver.entity';
import { Vehicle } from './vehicle.entity';
import { Vendor, VendorProduct } from './vendor.entity';

export enum TripStatus {
    PENDING = 'PENDING',
    STARTED = 'STARTED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export enum TripLoadStatus {
    PENDING = 'PENDING',
    LOADED = 'LOADED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export enum TripExpenseStatus {
    PENDING = 'PENDING',
    PAID = 'PAID',
    CANCELLED = 'CANCELLED',
}

@Entity('trips')
export class Trip {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', unique: true })
    tripCode: string;

    @Column({ type: 'varchar', nullable: true })
    odoReading?: string | null;

    @Column({ type: 'uuid' })
    vehicleId: string;

    @ManyToOne(() => Vehicle, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'vehicleId' })
    vehicle: Vehicle;

    @Column({ type: 'uuid' })
    driverId: string;

    @ManyToOne(() => Driver, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'driverId' })
    driver: Driver;

    @Column({ type: 'date' })
    tripDate: Date;

    @Column({
        type: 'enum',
        enum: TripStatus,
        default: TripStatus.PENDING,
    })
    status: TripStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TripUpcountryLoad, (load) => load.trip, { cascade: true })
    upcountryLoads: TripUpcountryLoad[];

    @OneToMany(() => TripDowncountryLoad, (load) => load.trip, {
        cascade: true,
    })
    downcountryLoads: TripDowncountryLoad[];

    @OneToMany(() => TripOfficeExpense, (expense) => expense.trip, {
        cascade: true,
    })
    officeExpenses: TripOfficeExpense[];

    @OneToMany(() => TripPumpExpense, (expense) => expense.trip, {
        cascade: true,
    })
    pumpExpenses: TripPumpExpense[];

    @OneToMany(() => TripFuelExpense, (expense) => expense.trip, {
        cascade: true,
    })
    fuelExpenses: TripFuelExpense[];

    @OneToMany(() => TripMtagExpense, (expense) => expense.trip, {
        cascade: true,
    })
    mtagExpenses: TripMtagExpense[];

    @OneToMany(() => TripOtherExpense, (expense) => expense.trip, {
        cascade: true,
    })
    otherExpenses: TripOtherExpense[];
}

@Entity('trip_upcountry_loads')
export class TripUpcountryLoad {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.upcountryLoads, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'clientId' })
    client: Client;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'biltyId' })
    bilty: Bilty;

    @Column({ type: 'varchar', nullable: true })
    toDetails?: string | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryChallanNumber?: string | null;

    @Column({ type: 'date', nullable: true })
    loadingDate?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    productDescription?: string | null;

    @Column({ type: 'varchar', nullable: true })
    address?: string | null;

    @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
    netWeight?: string | null;

    @Column({ type: 'int', nullable: true })
    cartonCount?: number | null;

    @Column({
        type: 'enum',
        enum: TripLoadStatus,
        default: TripLoadStatus.PENDING,
    })
    status: TripLoadStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_downcountry_loads')
export class TripDowncountryLoad {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.downcountryLoads, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'clientId' })
    client: Client;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'biltyId' })
    bilty: Bilty;

    @Column({ type: 'varchar', nullable: true })
    toDetails?: string | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryChallanNumber?: string | null;

    @Column({ type: 'date', nullable: true })
    loadingDate?: Date | null;

    @Column({ type: 'varchar', nullable: true })
    productDescription?: string | null;

    @Column({ type: 'varchar', nullable: true })
    address?: string | null;

    @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
    netWeight?: string | null;

    @Column({ type: 'int', nullable: true })
    cartonCount?: number | null;

    @Column({
        type: 'enum',
        enum: TripLoadStatus,
        default: TripLoadStatus.PENDING,
    })
    status: TripLoadStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_office_expenses')
export class TripOfficeExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.officeExpenses, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'assetAccountId' })
    assetAccount: ChartOfAccount;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: string;

    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: TripExpenseStatus,
        default: TripExpenseStatus.PENDING,
    })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_pump_expenses')
export class TripPumpExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.pumpExpenses, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    @Column({ type: 'uuid' })
    vendorAccountId: string;

    @ManyToOne(() => ChartOfAccount, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vendorAccountId' })
    vendorAccount: ChartOfAccount;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: string;

    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: TripExpenseStatus,
        default: TripExpenseStatus.PENDING,
    })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_fuel_expenses')
export class TripFuelExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.fuelExpenses, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    @Column({ type: 'uuid' })
    vendorAccountId: string;

    @ManyToOne(() => ChartOfAccount, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vendorAccountId' })
    vendorAccount: ChartOfAccount;

    @Column({ type: 'uuid' })
    vendorProductId: string;

    @ManyToOne(() => VendorProduct, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'vendorProductId' })
    vendorProduct: VendorProduct;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    rate: string;

    @Column({ type: 'decimal', precision: 12, scale: 3 })
    quantity: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: string;

    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: TripExpenseStatus,
        default: TripExpenseStatus.PENDING,
    })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_mtag_expenses')
export class TripMtagExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.mtagExpenses, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'assetAccountId' })
    assetAccount: ChartOfAccount;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: string;

    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: TripExpenseStatus,
        default: TripExpenseStatus.PENDING,
    })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_other_expenses')
export class TripOtherExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.otherExpenses, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'tripId' })
    trip: Trip;

    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, {
        nullable: false,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({ name: 'assetAccountId' })
    assetAccount: ChartOfAccount;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: string;

    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({
        type: 'enum',
        enum: TripExpenseStatus,
        default: TripExpenseStatus.PENDING,
    })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
