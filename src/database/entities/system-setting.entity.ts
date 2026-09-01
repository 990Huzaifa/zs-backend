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
};


@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SystemSettingKey, unique: true })
  key: SystemSettingKey;

  @Column({ type: 'jsonb' })
  value: GeoSettingValue | BusinessInfoSettingValue | Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
