import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * primary_inventory — warehouse receipt of a warehousing bilty.
 */
export class PrimaryInventory1791340000001 implements MigrationInterface {
  name = 'PrimaryInventory1791340000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "primary_inventory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "warehouseId" uuid NOT NULL,
        "biltyId" uuid NOT NULL,
        "gatePassNumber" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_primary_inventory" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_primary_inventory_biltyId" UNIQUE ("biltyId")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_primary_inventory_warehouseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        ADD CONSTRAINT "FK_primary_inventory_warehouseId"
        FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_primary_inventory_biltyId"
    `);
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        ADD CONSTRAINT "FK_primary_inventory_biltyId"
        FOREIGN KEY ("biltyId") REFERENCES "bilty"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_primary_inventory_warehouseId"
        ON "primary_inventory" ("warehouseId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_primary_inventory_gatePassNumber"
        ON "primary_inventory" ("gatePassNumber")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_primary_inventory_gatePassNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_primary_inventory_warehouseId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_primary_inventory_biltyId"
    `);
    await queryRunner.query(`
      ALTER TABLE "primary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_primary_inventory_warehouseId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "primary_inventory"`);
  }
}
