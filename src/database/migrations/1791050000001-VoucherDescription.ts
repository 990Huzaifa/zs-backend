import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add nullable `description` text column to all voucher tables
 * (and bilty_freights settlement vouchers).
 */
export class VoucherDescription1791050000001 implements MigrationInterface {
  name = 'VoucherDescription1791050000001';

  private readonly tables = [
    'client_vouchers',
    'vendor_vouchers',
    'expense_vouchers',
    'contra_vouchers',
    'salary_vouchers',
    'maintenance_vouchers',
    'bilty_freights',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "description" text
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}" DROP COLUMN IF EXISTS "description"
      `);
    }
  }
}
