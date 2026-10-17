import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * vendor_rate_logs.effectiveFromDate — previous rate's effective date
 * stored when price is updated (same idea as client_rate_logs).
 */
export class VendorRateLogEffectiveFromDate1791160000001
  implements MigrationInterface
{
  name = 'VendorRateLogEffectiveFromDate1791160000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_rate_logs"
        ADD COLUMN IF NOT EXISTS "effectiveFromDate" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_rate_logs"
        DROP COLUMN IF EXISTS "effectiveFromDate"
    `);
  }
}
