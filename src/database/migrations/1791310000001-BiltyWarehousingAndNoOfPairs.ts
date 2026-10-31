import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bilty.isWarehousing, bilty.warehouseId (FK warehouses), bilty.noOfPairs.
 */
export class BiltyWarehousingAndNoOfPairs1791310000001
  implements MigrationInterface
{
  name = 'BiltyWarehousingAndNoOfPairs1791310000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "isWarehousing" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "warehouseId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "noOfPairs" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_warehouseId_warehouses"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD CONSTRAINT "FK_bilty_warehouseId_warehouses"
        FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bilty_warehouseId"
        ON "bilty" ("warehouseId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_bilty_warehouseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_warehouseId_warehouses"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP COLUMN IF EXISTS "noOfPairs"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP COLUMN IF EXISTS "warehouseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP COLUMN IF EXISTS "isWarehousing"
    `);
  }
}
