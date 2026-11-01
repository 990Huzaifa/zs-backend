import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove primary_inventory.gatePassNumber — gate pass lives on bilty.deliveryChallanNumber.
 */
export class PrimaryInventoryDropGatePass1791360000001
  implements MigrationInterface
{
  name = 'PrimaryInventoryDropGatePass1791360000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_primary_inventory_gatePassNumber"
    `);
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP COLUMN IF EXISTS "gatePassNumber"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        ADD COLUMN IF NOT EXISTS "gatePassNumber" character varying
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_primary_inventory_gatePassNumber"
        ON "primary_inventory" ("gatePassNumber")
    `);
  }
}
