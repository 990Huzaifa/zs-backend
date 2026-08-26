import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
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

  @ManyToOne(() => VendorCategory, (vendorCategory) => vendorCategory.vendors)
  @JoinColumn({ name: 'vendorCategoryId' })
  vendorCategory: VendorCategory;

  @RelationId((vendor: Vendor) => vendor.vendorCategory)
  vendorCategoryId: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  altPhone?: string | null;

  // bank details

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

  @Column({ type: 'enum', enum: VendorStatus, default: VendorStatus.ACTIVE })
  status: VendorStatus;

  // address details
  @Column({ type: 'varchar', nullable: true })
  address?: string | null;

  @ManyToOne(() => State, (state) => state.vendors)
  @JoinColumn({ name: 'stateId' })
  state: State;

  @RelationId((vendor: Vendor) => vendor.state)
  stateId: string;


  @ManyToOne(() => City, (city) => city.vendors)
  @JoinColumn({ name: 'cityId' })
  city: City;

  @RelationId((vendor: Vendor) => vendor.city)
  cityId: string;

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
}
