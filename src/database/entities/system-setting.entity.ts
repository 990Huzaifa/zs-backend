import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SystemSettingKey {
  GEO = 'GEO',
}

export type GeoSettingValue = {
  defaultCountryId: string | null;
};

@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SystemSettingKey, unique: true })
  key: SystemSettingKey;

  @Column({ type: 'jsonb' })
  value: GeoSettingValue | Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
