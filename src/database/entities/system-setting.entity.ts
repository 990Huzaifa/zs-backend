import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SystemSettingKey {
  GEO = 'GEO',
  BUSINESS_INFO = 'BUSINESS_INFO',
  MAINTENANCE = 'MAINTENANCE',
}

/** How stock-issue / adjust forms pick a batch for a product. */
export enum MaintenanceBatchPickingMethod {
  FIFO = 'FIFO',
  LIFO = 'LIFO',
  MANUAL = 'MANUAL',
}

export type GeoSettingValue = {
  defaultCountryId: string | null;
};

export type BusinessInfoSettingValue = {
  logoUrl: string | null;
  companyName: string | null;
  tagLine: string | null;
  address: string | null;
  ptcl: string | null;
  phone: string | null;
  email: string | null;
};

export type MaintenanceSettingValue = {
  batchPickingMethod: MaintenanceBatchPickingMethod;
};

@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SystemSettingKey, unique: true })
  key: SystemSettingKey;

  @Column({ type: 'jsonb' })
  value:
    | GeoSettingValue
    | BusinessInfoSettingValue
    | MaintenanceSettingValue
    | Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
