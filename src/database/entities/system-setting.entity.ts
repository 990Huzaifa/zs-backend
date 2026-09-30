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
  PAYROLL = 'PAYROLL',
}

/** How stock-issue / adjust forms pick a batch for a product. */
export enum MaintenanceBatchPickingMethod {
  FIFO = 'FIFO',
  LIFO = 'LIFO',
  MANUAL = 'MANUAL',
}

/** Payroll generation mode — manual API vs scheduled auto-run. */
export enum PayrollAutomationMode {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
}

export type GeoSettingValue = {
  defaultCountryId: string | null;
};

export type BusinessInfoSettingValue = {
  logoUrl: string | null;
  ntn: string | null;
  companyName: string | null;
  tagLine: string | null;
  /** Company registration / licence number (e.g. SECP). */
  govtRegNo: string | null;
  primaryAddress: string | null;
  secondaryAddress: string | null;
  ptcl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
};

export type MaintenanceSettingValue = {
  batchPickingMethod: MaintenanceBatchPickingMethod;
};

export type PayrollSettingValue = {
  /** MANUAL = HR triggers APIs; AUTO = cron creates period + calculates. */
  mode: PayrollAutomationMode;
  /** Day of month to run (1–28). Applies when mode is AUTO. */
  autoDayOfMonth: number;
  /** Local time HH:mm in `timezone`. */
  autoTime: string;
  timezone: string;
  /** Create previous-month pay period if missing. */
  autoCreatePeriod: boolean;
  /** Create payroll run and calculate payslips. */
  autoCalculate: boolean;
  /** Usually false — keep finance approval manual. */
  autoApprove: boolean;
  /** Usually false — keep payment posting manual. */
  autoMarkPaid: boolean;
  /** Idempotency key of last successful auto run, e.g. "2026-02". */
  lastAutoPeriodKey: string | null;
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
    | PayrollSettingValue
    | Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
