import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop inventory_logs.arrivalDate — no longer used on stock entry / inventory log.
 */
export class InventoryLogDropArrivalDate1791470000001
  implements MigrationInterface
{
  name = 'InventoryLogDropArrivalDate1791470000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_logs_arrivalDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP COLUMN IF EXISTS "arrivalDate"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD COLUMN IF NOT EXISTS "arrivalDate" date
    `);

    await queryRunner.query(`
      UPDATE "inventory_logs"
      SET "arrivalDate" = ("createdAt" AT TIME ZONE 'UTC')::date
      WHERE "arrivalDate" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ALTER COLUMN "arrivalDate" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_logs_arrivalDate"
        ON "inventory_logs" ("arrivalDate")
    `);
  }
}
