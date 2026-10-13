import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add bilty_freights.freightAmount (part of totalAmount breakdown). */
export class BiltyFreightAmount1791060000001 implements MigrationInterface {
  name = 'BiltyFreightAmount1791060000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "freightAmount" numeric(20,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "freightAmount"
    `);
  }
}
