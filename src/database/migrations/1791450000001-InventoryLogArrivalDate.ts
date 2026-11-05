import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * inventory_logs.arrivalDate — stock entry arrival date (date).
 */
export class InventoryLogArrivalDate1791450000001
  implements MigrationInterface
{
  name = 'InventoryLogArrivalDate1791450000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD COLUMN IF NOT EXISTS "arrivalDate" date
    `);

    // Backfill existing rows from createdAt
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_logs_arrivalDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP COLUMN IF EXISTS "arrivalDate"
    `);
  }
}
