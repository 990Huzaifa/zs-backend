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
import { City } from './city.entity';
import { State } from './state.entity';

export enum VendorStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  BLOCKED = 'BLOCKED',
}

export enum RateStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum VendorTaxStatus {
  ACTIVE = 'ACTIVE',
  NON_ACTIVE = 'NON_ACTIVE',
}

@Entity('vendor_categories')
export class VendorCategory {
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

  @OneToMany(() => Vendor, (vendor) => vendor.vendorCategory)
  vendors: Vendor[];
}

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vendorCategoryId: string;

  @ManyToOne(() => VendorCategory, (vendorCategory) => vendorCategory.vendors, {
    nullable: false,
  })
  @JoinColumn({ name: 'vendorCategoryId' })
  vendorCategory: VendorCategory;

  @Column()
  name: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  altPhone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankAccountNumber?: string | null;

  @Column({
    type: 'enum',
    enum: VendorTaxStatus,
    default: VendorTaxStatus.NON_ACTIVE,
  })
  taxStatus: VendorTaxStatus;

  @Column({ type: 'enum', enum: VendorStatus, default: VendorStatus.PENDING })
  status: VendorStatus;

  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

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

  @Column({ type: 'varchar', nullable: true })
  lat?: string | null;

  @Column({ type: 'varchar', nullable: true })
  lng?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => VendorRate, (rate) => rate.vendor)
  rates: VendorRate[];
}

@Entity('vendor_products')
export class VendorProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'int' })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => VendorRate, (rate) => rate.product)
  rates: VendorRate[];
}

@Entity('vendor_rates')
export class VendorRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vendorId: string;

  @ManyToOne(() => Vendor, (vendor) => vendor.rates, { nullable: false })
  @JoinColumn({ name: 'vendorId' })
  vendor: Vendor;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => VendorProduct, (product) => product.rates, {
    nullable: false,
  })
  @JoinColumn({ name: 'productId' })
  product: VendorProduct;

  @Column({ type: 'varchar', nullable: true })
  locationName?: string | null;

  @Column({ type: 'int' })
  cityId: number;

  @ManyToOne(() => City, { nullable: false })
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'date' })
  effectiveFromDate: string;

  @Column({ type: 'enum', enum: RateStatus, default: RateStatus.SCHEDULED })
  status: RateStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}