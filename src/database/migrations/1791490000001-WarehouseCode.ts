import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * warehouses.warehouseCode — auto serial `WH-0001` …
 */
export class WarehouseCode1791490000001 implements MigrationInterface {
  name = 'WarehouseCode1791490000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "warehouses"
        ADD COLUMN IF NOT EXISTS "warehouseCode" character varying
    `);

    await queryRunner.query(`
      WITH ordered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
        FROM "warehouses"
        WHERE "warehouseCode" IS NULL OR TRIM("warehouseCode") = ''
      )
      UPDATE "warehouses" w
      SET "warehouseCode" = 'WH-' || LPAD(ordered.rn::text, 4, '0')
      FROM ordered
      WHERE w.id = ordered.id
    `);

    await queryRunner.query(`
      ALTER TABLE "warehouses"
        ALTER COLUMN "warehouseCode" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_warehouses_warehouseCode"
        ON "warehouses" ("warehouseCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_warehouses_warehouseCode"
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouses"
        DROP COLUMN IF EXISTS "warehouseCode"
    `);
  }
}
