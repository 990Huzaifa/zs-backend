import { MigrationInterface, QueryRunner } from 'typeorm';

/** VendorRate: drop cityId — rates are scoped by vendor + product (+ optional locationName). */
export class VendorRateDropCityId1791130000001 implements MigrationInterface {
  name = 'VendorRateDropCityId1791130000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        DROP CONSTRAINT IF EXISTS "FK_310ab257365323239fcbb573ab2"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        DROP COLUMN IF EXISTS "cityId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        ADD COLUMN IF NOT EXISTS "cityId" integer
    `);

    // Best-effort backfill from vendor city so NOT NULL can be restored.
    await queryRunner.query(`
      UPDATE "vendor_rates" vr
      SET "cityId" = v."cityId"
      FROM "vendors" v
      WHERE vr."vendorId" = v.id
        AND vr."cityId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "vendor_rates"
      SET "cityId" = (SELECT MIN(id) FROM "cities")
      WHERE "cityId" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        ALTER COLUMN "cityId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        DROP CONSTRAINT IF EXISTS "FK_310ab257365323239fcbb573ab2"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_rates"
        ADD CONSTRAINT "FK_310ab257365323239fcbb573ab2"
        FOREIGN KEY ("cityId") REFERENCES "cities"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }
}
