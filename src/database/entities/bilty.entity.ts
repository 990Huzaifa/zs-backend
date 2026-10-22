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
import { ChartOfAccount } from './chart-of-account.entity';
import { TransportationProduct } from './transportation-product.entity';
import { PaymentMethod, VoucherStatus } from './voucher.entity';

export enum BiltyStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  IN_TRANSIT = 'IN_TRANSIT',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

/** Trip load side this bilty is intended for. */
export enum BiltyLoadType {
  UP_COUNTRY = 'UP_COUNTRY',
  DOWN_COUNTRY = 'DOWN_COUNTRY',
}

/** PAYABLE = we pay party; RECEIVABLE = we collect from party */
export enum BiltyFreightVoucherType {
  PAYABLE = 'PAYABLE',
  RECEIVABLE = 'RECEIVABLE',
}

/** Which party the freight voucher settles against. */
export enum BiltyFreightPartyType {
  BROKER = 'BROKER',
  TRANSPORTER = 'TRANSPORTER',
}

@Entity('bilty')
export class Bilty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column({ type: 'date' })
  issueDate: Date;

  @Column({ type: 'int', nullable: true })
  estimatedHours?: number | null;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, { nullable: false })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  /** Optional broker party — client with category BROKER. */
  @Column({ type: 'uuid', nullable: true })
  brokerId?: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'brokerId' })
  broker?: Client | null;

  @Column({ type: 'uuid', nullable: true })
  vehicleId?: string | null;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicleId' })
  vehicle?: Vehicle | null;

  @Column({ type: 'int', nullable: true })
  odometer?: number | null;

  /** Free-text plate when not linked to fleet `vehicleId`. */
  @Column({ type: 'varchar', nullable: true })
  vehicleRegistrationNumber?: string | null;

  @Column({ type: 'varchar', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', nullable: true })
  remarks?: string | null;

  @Column({ type: 'uuid', nullable: true })
  transportationProductId?: string | null;

  @ManyToOne(() => TransportationProduct, { nullable: true })
  @JoinColumn({ name: 'transportationProductId' })
  transportationProduct?: TransportationProduct | null;

  @Column({ type: 'varchar', nullable: true })
  refNumber?: string | null;

  @Column({ type: 'varchar', nullable: true })
  totalWeight?: string | null;

  @Column({ type: 'varchar', nullable: true })
  noOfPackages?: string | null;

  /** Optional transporter party — client with category TRANSPORTER. */
  @Column({ type: 'uuid', nullable: true })
  transporterId?: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transporterId' })
  transporter?: Client | null;

  /** Maps legacy DB column `transaportorName` (typo kept in DB). */
  @Column({ name: 'transaportorName', type: 'varchar', nullable: true })
  transporterName?: string | null;

  /** Maps legacy DB column `transaportorPhone` (typo kept in DB). */
  @Column({ name: 'transaportorPhone', type: 'varchar', nullable: true })
  transporterPhone?: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User | null;

  @Column({
    type: 'enum',
    enum: BiltyStatus,
    default: BiltyStatus.PENDING,
  })
  status: BiltyStatus;

  /**
   * Upcountry vs downcountry — used by trip load bilty pickers.
   * Existing rows migrate as UP_COUNTRY; set explicitly on create/edit.
   */
  @Column({
    type: 'enum',
    enum: BiltyLoadType,
    default: BiltyLoadType.UP_COUNTRY,
  })
  loadType: BiltyLoadType;

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

  @OneToMany(() => BiltyFreight, (freight) => freight.bilty, {
    cascade: true,
  })
  freights: BiltyFreight[];
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

  @Column({ type: 'timestamp', nullable: true })
  departureDateTime?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  loadingArrivalDateTime: Date | null;

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

  @Column({ type: 'jsonb', nullable: true })
  stopsContact: { name: string; phone: string; address: string }[] | null;

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

  @Column({ type: 'timestamp', nullable: true })
  offLoadingDateTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  offLoadingArrivalDateTime: Date | null;

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

  @Column({ type: 'jsonb', nullable: true })
  stopsContact: { name: string; phone: string; address: string }[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Broker or transporter freight settlement voucher linked to a bilty.
 * PAYABLE = pay party; RECEIVABLE = collect from party.
 */
@Entity('bilty_freights')
export class BiltyFreight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  voucherNumber: string;

  @Column({ type: 'uuid' })
  biltyId: string;

  @ManyToOne(() => Bilty, (bilty) => bilty.freights, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'biltyId' })
  bilty: Bilty;

  @Column({
    type: 'enum',
    enum: BiltyFreightPartyType,
    default: BiltyFreightPartyType.BROKER,
  })
  partyType: BiltyFreightPartyType;

  /** Broker party — client with category BROKER (when partyType = BROKER). */
  @Column({ type: 'uuid', nullable: true })
  brokerId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'brokerId' })
  broker?: Client | null;

  /** Transporter party — client with category TRANSPORTER (when partyType = TRANSPORTER). */
  @Column({ type: 'uuid', nullable: true })
  transporterId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transporterId' })
  transporter?: Client | null;

  /** Cash / bank (asset) account */
  @Column({ type: 'uuid' })
  assetAccId: string;

  @ManyToOne(() => ChartOfAccount, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assetAccId' })
  assetAcc: ChartOfAccount;

  @Column({ type: 'enum', enum: BiltyFreightVoucherType })
  voucherType: BiltyFreightVoucherType;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', nullable: true })
  chequeNumber: string | null;

  @Column({ type: 'date', nullable: true })
  chequeDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  chequeBank: string | null;

  @Column({ type: 'varchar', nullable: true })
  transactionNo: string | null;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  freightAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  detentionAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  stopCommissionAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  othersAmount: number;

  /** Ledger posts this amount (defaults to freight + detention + stopCommission + others). */
  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalAmount: number;

  /** Apply sales tax on this freight voucher. */
  @Column({ type: 'boolean', default: false })
  saleTax: boolean;

  /** Apply withholding tax on this freight voucher. */
  @Column({ type: 'boolean', default: false })
  withHoldingTax: boolean;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** S3 object keys for payment proof images */
  @Column({ type: 'jsonb', nullable: true })
  proofImages: string[] | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({
    type: 'enum',
    enum: VoucherStatus,
    default: VoucherStatus.PENDING,
  })
  status: VoucherStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
