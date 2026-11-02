import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Warehousing:
 * - secondary_inventory (shop allocation from primary)
 * - inventory_logs (logType enum)
 * - stock_balances: nullable warehouseId + shopId (table already existed)
 */
export class SecondaryInventoryLogsStockBalances1791370000001
  implements MigrationInterface
{
  name = 'SecondaryInventoryLogsStockBalances1791370000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."inventory_logs_logtype_enum" AS ENUM(
          'INVENTORY_IN',
          'INVENTORY_OUT',
          'INVENTORY_ADJUSTMENT',
          'INVENTORY_TRANSFER',
          'INVENTORY_RETURN',
          'INVENTORY_LOSS',
          'INVENTORY_THEFT',
          'INVENTORY_EXPIRED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "secondary_inventory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stockCode" character varying NOT NULL,
        "primaryInventoryId" uuid NOT NULL,
        "shopId" uuid NOT NULL,
        "InvoiceNo" character varying NOT NULL,
        "noOfCartons" integer NOT NULL,
        "noOfPairs" integer NOT NULL DEFAULT 0,
        "damagedCartons" integer NOT NULL DEFAULT 0,
        "returnedCartons" integer NOT NULL DEFAULT 0,
        "remarks" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_secondary_inventory" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_secondary_inventory_primaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        ADD CONSTRAINT "FK_secondary_inventory_primaryInventoryId"
        FOREIGN KEY ("primaryInventoryId") REFERENCES "primary_inventory"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_secondary_inventory_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        ADD CONSTRAINT "FK_secondary_inventory_shopId"
        FOREIGN KEY ("shopId") REFERENCES "shop"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_secondary_inventory_primaryInventoryId"
        ON "secondary_inventory" ("primaryInventoryId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_secondary_inventory_shopId"
        ON "secondary_inventory" ("shopId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_secondary_inventory_stockCode"
        ON "secondary_inventory" ("stockCode")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "secondaryInventoryId" uuid,
        "logType" "public"."inventory_logs_logtype_enum" NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_secondaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD CONSTRAINT "FK_inventory_logs_secondaryInventoryId"
        FOREIGN KEY ("secondaryInventoryId") REFERENCES "secondary_inventory"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_logs_secondaryInventoryId"
        ON "inventory_logs" ("secondaryInventoryId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_logs_logType"
        ON "inventory_logs" ("logType")
    `);

    // stock_balances already exists from NewAddition — align with entity
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP CONSTRAINT IF EXISTS "FK_d949e4488d09dca62fd3561fa90"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP CONSTRAINT IF EXISTS "FK_stock_balances_warehouseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ALTER COLUMN "warehouseId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ADD CONSTRAINT "FK_stock_balances_warehouseId"
        FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ADD COLUMN IF NOT EXISTS "shopId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP CONSTRAINT IF EXISTS "FK_stock_balances_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ADD CONSTRAINT "FK_stock_balances_shopId"
        FOREIGN KEY ("shopId") REFERENCES "shop"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_balances_warehouseId"
        ON "stock_balances" ("warehouseId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_balances_shopId"
        ON "stock_balances" ("shopId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_balances_shopId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_balances_warehouseId"`,
    );

    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP CONSTRAINT IF EXISTS "FK_stock_balances_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP COLUMN IF EXISTS "shopId"
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        DROP CONSTRAINT IF EXISTS "FK_stock_balances_warehouseId"
    `);
    // Restore prior NOT NULL only where warehouseId is present
    await queryRunner.query(`
      DELETE FROM "stock_balances" WHERE "warehouseId" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ALTER COLUMN "warehouseId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_balances"
        ADD CONSTRAINT "FK_d949e4488d09dca62fd3561fa90"
        FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_logs_logType"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_logs_secondaryInventoryId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_secondaryInventoryId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_logs"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_secondary_inventory_stockCode"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_secondary_inventory_shopId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_secondary_inventory_primaryInventoryId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_secondary_inventory_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_secondary_inventory_primaryInventoryId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "secondary_inventory"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."inventory_logs_logtype_enum"`,
    );
  }
}
