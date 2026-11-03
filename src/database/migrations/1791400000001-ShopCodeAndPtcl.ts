import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - shop.shopCode (auto SH-0001…)
 * - rename shop.inchargePhone → ptcl
 */
export class ShopCodeAndPtcl1791400000001 implements MigrationInterface {
  name = 'ShopCodeAndPtcl1791400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop"
        ADD COLUMN IF NOT EXISTS "shopCode" character varying
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'shop' AND column_name = 'inchargePhone'
        ) THEN
          ALTER TABLE "shop" RENAME COLUMN "inchargePhone" TO "ptcl";
        END IF;
      END $$
    `);

    // Backfill shopCode for existing rows: SH-0001, SH-0002, …
    await queryRunner.query(`
      WITH ordered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
        FROM "shop"
        WHERE "shopCode" IS NULL OR TRIM("shopCode") = ''
      )
      UPDATE "shop" s
      SET "shopCode" = 'SH-' || LPAD(ordered.rn::text, 4, '0')
      FROM ordered
      WHERE s.id = ordered.id
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shop_shopCode"
        ON "shop" ("shopCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_shop_shopCode"`);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'shop' AND column_name = 'ptcl'
        ) THEN
          ALTER TABLE "shop" RENAME COLUMN "ptcl" TO "inchargePhone";
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "shop"
        DROP COLUMN IF EXISTS "shopCode"
    `);
  }
}
