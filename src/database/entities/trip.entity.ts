import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { Client } from './client.entity';
import { Driver } from './driver.entity';
import { Bilty } from './bilty.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { Vendor, VendorProduct } from './vendor.entity';

export enum TripStatus {
    PENDING = 'PENDING',
    STARTED = 'STARTED',
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

    @Column({ type: 'varchar' })
    tripCode: string;

    @Column({ type: 'varchar', nullable: true })
    ODO?: string | null;

    @Column({ type: 'uuid' })
    vehicleId: string;

    @ManyToOne(() => Vehicle, (vehicle) => vehicle.id)
    vehicle: Vehicle;

    @Column({ type: 'uuid' })
    driverId: string;

    @ManyToOne(() => Driver, (driver) => driver.id)
    driver: Driver;

    @Column({ type: 'date' })
    tripDate: Date;

    @Column({ type: 'enum', enum: TripStatus, default: TripStatus.PENDING })
    status: TripStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trip_upcountry_loads')
export class TripUpcountryLoad {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // form info



    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, (client) => client.id)
    client: Client;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, (bilty) => bilty.id)
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

    @Column({ type: 'float', nullable: true })
    netWeight?: number | null;

    @Column({ type: 'int', nullable: true })
    cartonCount?: number | null;

    // end

    @Column({ type: 'enum', enum: TripStatus, default: TripStatus.PENDING })
    upcountryLoadStatus: TripStatus;

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

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // form info



    @Column({ type: 'uuid' })
    clientId: string;

    @ManyToOne(() => Client, (client) => client.id)
    client: Client;

    @Column({ type: 'uuid' })
    biltyId: string;

    @ManyToOne(() => Bilty, (bilty) => bilty.id)
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

    @Column({ type: 'float', nullable: true })
    netWeight?: number | null;

    @Column({ type: 'int', nullable: true })
    cartonCount?: number | null;

    // end

    @Column({ type: 'enum', enum: TripStatus, default: TripStatus.PENDING })
    downcountryLoadStatus: TripStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

// expenses table

@Entity('trip_office_expenses')
export class TripOfficeExpense {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tripId: string;

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // asset account from chart of accounts
    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.id)
    assetAccount: ChartOfAccount;

    // amount
    @Column({ type: 'float' })
    amount: number;

    // expense date
    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({ type: 'enum', enum: TripExpenseStatus, default: TripExpenseStatus.PENDING })
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

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // vendor here

    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, (vendor) => vendor.id)
    vendor: Vendor;

    // vendor account from chart of accounts
    @Column({ type: 'uuid' })
    vendorAccountId: string;

    @ManyToOne(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.id)
    vendorAccount: ChartOfAccount;

    // amount
    @Column({ type: 'float' })
    amount: number;

    // expense date
    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({ type: 'enum', enum: TripExpenseStatus, default: TripExpenseStatus.PENDING })
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

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // vendor here
    @Column({ type: 'uuid' })
    vendorId: string;

    @ManyToOne(() => Vendor, (vendor) => vendor.id)
    vendor: Vendor;

    // vendor account from chart of accounts
    @Column({ type: 'uuid' })
    vendorAccountId: string;

    @ManyToOne(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.id)
    vendorAccount: ChartOfAccount;

    // vendor product and rates info
    @Column({ type: 'uuid' })
    vendorProductId: string;

    @ManyToOne(() => VendorProduct, (vendorProduct) => vendorProduct.id)
    vendorProduct: VendorProduct;

    @Column({ type: 'float' })
    rate: number;

    @Column({ type: 'float' })
    quantity: number;

    // amount
    @Column({ type: 'float' })
    amount: number;

    // expense date
    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({ type: 'enum', enum: TripExpenseStatus, default: TripExpenseStatus.PENDING })
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

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // asset account from chart of accounts
    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.id)
    assetAccount: ChartOfAccount;

    // amount
    @Column({ type: 'float' })
    amount: number;

    // expense date
    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({ type: 'enum', enum: TripExpenseStatus, default: TripExpenseStatus.PENDING })
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

    @ManyToOne(() => Trip, (trip) => trip.id)
    trip: Trip;

    // asset account from chart of accounts
    @Column({ type: 'uuid' })
    assetAccountId: string;

    @ManyToOne(() => ChartOfAccount, (chartOfAccount) => chartOfAccount.id)
    assetAccount: ChartOfAccount;

    // amount
    @Column({ type: 'float' })
    amount: number;

    // expense date
    @Column({ type: 'date' })
    expenseDate: Date;

    @Column({ type: 'varchar', nullable: true })
    description?: string | null;

    @Column({ type: 'enum', enum: TripExpenseStatus, default: TripExpenseStatus.PENDING })
    status: TripExpenseStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}