import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * primary_inventory.primaryCode — auto serial `PMI-0001` …
 */
export class PrimaryInventoryCode1791480000001 implements MigrationInterface {
  name = 'PrimaryInventoryCode1791480000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        ADD COLUMN IF NOT EXISTS "primaryCode" character varying
    `);

    // Backfill existing rows in createdAt order: PMI-0001, PMI-0002, …
    await queryRunner.query(`
      WITH ordered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
        FROM "primary_inventory"
        WHERE "primaryCode" IS NULL OR TRIM("primaryCode") = ''
      )
      UPDATE "primary_inventory" pi
      SET "primaryCode" = 'PMI-' || LPAD(ordered.rn::text, 4, '0')
      FROM ordered
      WHERE pi.id = ordered.id
    `);

    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        ALTER COLUMN "primaryCode" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_primary_inventory_primaryCode"
        ON "primary_inventory" ("primaryCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_primary_inventory_primaryCode"
    `);
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP COLUMN IF EXISTS "primaryCode"
    `);
  }
}
