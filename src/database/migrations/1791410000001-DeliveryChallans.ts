import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shop delivery challans + line items (inventory log invoices).
 * Code series: DC-00001 …
 */
export class DeliveryChallans1791410000001 implements MigrationInterface {
  name = 'DeliveryChallans1791410000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."delivery_challans_status_enum" AS ENUM(
          'PENDING',
          'APPROVED',
          'COMPLETED',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_challans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "challanNo" character varying NOT NULL,
        "challanDateTime" TIMESTAMP NOT NULL,
        "primaryInventoryId" uuid NOT NULL,
        "shopId" uuid NOT NULL,
        "driverId" uuid NOT NULL,
        "vehicleId" uuid NOT NULL,
        "totalInvoices" integer NOT NULL DEFAULT 0,
        "totalCartons" integer NOT NULL DEFAULT 0,
        "totalPairs" integer NOT NULL DEFAULT 0,
        "status" "public"."delivery_challans_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_challans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_delivery_challans_challanNo" UNIQUE ("challanNo")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_primaryInventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        ADD CONSTRAINT "FK_delivery_challans_primaryInventoryId"
        FOREIGN KEY ("primaryInventoryId") REFERENCES "primary_inventory"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        ADD CONSTRAINT "FK_delivery_challans_shopId"
        FOREIGN KEY ("shopId") REFERENCES "shop"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_driverId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        ADD CONSTRAINT "FK_delivery_challans_driverId"
        FOREIGN KEY ("driverId") REFERENCES "drivers"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_vehicleId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        ADD CONSTRAINT "FK_delivery_challans_vehicleId"
        FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_primaryInventoryId"
        ON "delivery_challans" ("primaryInventoryId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_shopId"
        ON "delivery_challans" ("shopId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_driverId"
        ON "delivery_challans" ("driverId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_vehicleId"
        ON "delivery_challans" ("vehicleId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_status"
        ON "delivery_challans" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challans_challanDateTime"
        ON "delivery_challans" ("challanDateTime")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_challan_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deliveryChallanId" uuid NOT NULL,
        "inventoryId" uuid NOT NULL,
        "noOfCartons" integer NOT NULL,
        "noOfPairs" integer NOT NULL DEFAULT 0,
        "remarks" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_challan_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challan_items_deliveryChallanId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        ADD CONSTRAINT "FK_delivery_challan_items_deliveryChallanId"
        FOREIGN KEY ("deliveryChallanId") REFERENCES "delivery_challans"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challan_items_inventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        ADD CONSTRAINT "FK_delivery_challan_items_inventoryId"
        FOREIGN KEY ("inventoryId") REFERENCES "inventory_logs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challan_items_deliveryChallanId"
        ON "delivery_challan_items" ("deliveryChallanId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_delivery_challan_items_inventoryId"
        ON "delivery_challan_items" ("inventoryId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challan_items_inventoryId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challan_items_deliveryChallanId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challan_items_inventoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challan_items"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challan_items_deliveryChallanId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_challan_items"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_challanDateTime"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_vehicleId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_driverId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_shopId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_delivery_challans_primaryInventoryId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_vehicleId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_driverId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_shopId"
    `);
    await queryRunner.query(`
      ALTER TABLE "delivery_challans"
        DROP CONSTRAINT IF EXISTS "FK_delivery_challans_primaryInventoryId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_challans"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."delivery_challans_status_enum"`,
    );
  }
}
