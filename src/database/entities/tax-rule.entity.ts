import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

/** UI "TYPE" column */
export enum TaxRuleType {
  SALES_TAX = 'SALES_TAX',
  SERVICE_TAX = 'SERVICE_TAX',
  WITH_HOLDING_TAX = 'WITH_HOLDING_TAX',
  OTHER_TAX = 'OTHER_TAX',
}

/**
 * Manual enable/disable (toggle in UI).
 * Display badges Active / Expired / Upcoming are derived from
 * effectiveFrom / effectiveTo + this status at API layer.
 */
export enum TaxRuleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('tax_rules')
export class TaxRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({
    type: 'enum',
    enum: TaxRuleType,
  })
  type: TaxRuleType;

  @Column()
  authority: string;

  /** Percentage rate, e.g. 15.00 for 15% */
  @Column({ type: 'decimal', precision: 8, scale: 4 })
  rate: string;

  @Column({ type: 'date' })
  effectiveFrom: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo?: string | null;

  @Column({
    type: 'enum',
    enum: TaxRuleStatus,
    default: TaxRuleStatus.ACTIVE,
  })
  status: TaxRuleStatus;

  @ManyToMany(() => Client, (client) => client.saleTaxTypes)
  clients: Client[];

  @ManyToMany(() => Client, (client) => client.withHoldingTaxTypes)
  withHoldingTaxClients: Client[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
