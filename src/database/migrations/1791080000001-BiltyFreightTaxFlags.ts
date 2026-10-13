import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add saleTax / withHoldingTax flags on bilty_freights. */
export class BiltyFreightTaxFlags1791080000001 implements MigrationInterface {
  name = 'BiltyFreightTaxFlags1791080000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "saleTax" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "withHoldingTax" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "withHoldingTax"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "saleTax"
    `);
  }
}
