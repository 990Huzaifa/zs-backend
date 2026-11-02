import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move stock-entry fields onto inventory_logs (from secondary_inventory).
 * Slim secondary_inventory to stockCode + primaryInventoryId only.
 */
export class InventoryLogsStockEntryFields1791390000001
  implements MigrationInterface
{
  name = 'InventoryLogsStockEntryFields1791390000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- inventory_logs: add stock-entry columns ---
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD COLUMN IF NOT EXISTS "primaryInventoryId" uuid,
        ADD COLUMN IF NOT EXISTS "shopId" uuid,
        ADD COLUMN IF NOT EXISTS "InvoiceNo" character varying,
        ADD COLUMN IF NOT EXISTS "noOfCartons" integer,
        ADD COLUMN IF NOT EXISTS "noOfPairs" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "damagedCartons" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "returnedCartons" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "remarks" character varying,
        ADD COLUMN IF NOT EXISTS "proofImages" jsonb
    `);

    // Backfill from secondary_inventory when linked
    await queryRunner.query(`
      UPDATE "inventory_logs" log
      SET
        "primaryInventoryId" = s."primaryInventoryId",
        "shopId" = s."shopId",
        "InvoiceNo" = s."InvoiceNo",
        "noOfCartons" = s."noOfCartons",
        "noOfPairs" = COALESCE(s."noOfPairs", 0),
        "damagedCartons" = COALESCE(s."damagedCartons", 0),
        "returnedCartons" = COALESCE(s."returnedCartons", 0),
        "remarks" = s."remarks"
      FROM "secondary_inventory" s
      WHERE log."secondaryInventoryId" = s.id
        AND log."primaryInventoryId" IS NULL
    `);

    // Drop old FK / index / column
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_secondaryInventoryId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_logs_secondaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP COLUMN IF EXISTS "secondaryInventoryId"
    `);

    // Enforce NOT NULL on required fields (delete orphan rows without source data)
    await queryRunner.query(`
      DELETE FROM "inventory_logs"
      WHERE "primaryInventoryId" IS NULL
         OR "shopId" IS NULL
         OR "InvoiceNo" IS NULL
         OR "noOfCartons" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ALTER COLUMN "primaryInventoryId" SET NOT NULL,
        ALTER COLUMN "shopId" SET NOT NULL,
        ALTER COLUMN "InvoiceNo" SET NOT NULL,
        ALTER COLUMN "noOfCartons" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_primaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD CONSTRAINT "FK_inventory_logs_primaryInventoryId"
        FOREIGN KEY ("primaryInventoryId") REFERENCES "primary_inventory"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD CONSTRAINT "FK_inventory_logs_shopId"
        FOREIGN KEY ("shopId") REFERENCES "shop"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_logs_primaryInventoryId"
        ON "inventory_logs" ("primaryInventoryId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_logs_shopId"
        ON "inventory_logs" ("shopId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_logs_InvoiceNo"
        ON "inventory_logs" ("InvoiceNo")
    `);

    // --- slim secondary_inventory ---
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_secondary_inventory_InvoiceNo"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_secondary_inventory_shopId"
    `);

    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP CONSTRAINT IF EXISTS "FK_secondary_inventory_shopId"
    `);

    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        DROP COLUMN IF EXISTS "shopId",
        DROP COLUMN IF EXISTS "InvoiceNo",
        DROP COLUMN IF EXISTS "noOfCartons",
        DROP COLUMN IF EXISTS "noOfPairs",
        DROP COLUMN IF EXISTS "damagedCartons",
        DROP COLUMN IF EXISTS "returnedCartons",
        DROP COLUMN IF EXISTS "remarks"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore secondary columns
    await queryRunner.query(`
      ALTER TABLE "secondary_inventory"
        ADD COLUMN IF NOT EXISTS "shopId" uuid,
        ADD COLUMN IF NOT EXISTS "InvoiceNo" character varying,
        ADD COLUMN IF NOT EXISTS "noOfCartons" integer,
        ADD COLUMN IF NOT EXISTS "noOfPairs" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "damagedCartons" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "returnedCartons" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "remarks" character varying
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
      CREATE INDEX IF NOT EXISTS "IDX_secondary_inventory_shopId"
        ON "secondary_inventory" ("shopId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_secondary_inventory_InvoiceNo"
        ON "secondary_inventory" ("InvoiceNo")
    `);

    // Restore inventory_logs.secondaryInventoryId (nullable) — cannot fully restore data
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        ADD COLUMN IF NOT EXISTS "secondaryInventoryId" uuid
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
      DROP INDEX IF EXISTS "UQ_inventory_logs_InvoiceNo"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_logs_shopId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_inventory_logs_primaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP CONSTRAINT IF EXISTS "FK_inventory_logs_primaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_logs"
        DROP COLUMN IF EXISTS "proofImages",
        DROP COLUMN IF EXISTS "remarks",
        DROP COLUMN IF EXISTS "returnedCartons",
        DROP COLUMN IF EXISTS "damagedCartons",
        DROP COLUMN IF EXISTS "noOfPairs",
        DROP COLUMN IF EXISTS "noOfCartons",
        DROP COLUMN IF EXISTS "InvoiceNo",
        DROP COLUMN IF EXISTS "shopId",
        DROP COLUMN IF EXISTS "primaryInventoryId"
    `);
  }
}
