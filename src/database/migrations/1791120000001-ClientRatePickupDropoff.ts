import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ClientRate:
 * - Replace cityId with pickupLocationId + dropoffLocationId
 * - Rename pricing columns to camelCase
 * - Add fixedRatePercentage + variableRatePercentage
 *
 * Existing rates cannot be mapped from city → locations, so rows are cleared.
 */
export class ClientRatePickupDropoff1791120000001
  implements MigrationInterface
{
  name = 'ClientRatePickupDropoff1791120000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "client_rate_logs"`);
    await queryRunner.query(`DELETE FROM "client_rates"`);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_c60e2f03fe0cfa42c8bb52356e4"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP COLUMN IF EXISTS "cityId"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "fuelrate" TO "fuelRate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "freightrate" TO "freightRate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "fixedrate" TO "fixedRate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "variablerate" TO "variableRate"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD COLUMN IF NOT EXISTS "fixedRatePercentage" numeric(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD COLUMN IF NOT EXISTS "variableRatePercentage" numeric(10,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ALTER COLUMN "fixedRatePercentage" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ALTER COLUMN "variableRatePercentage" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD COLUMN IF NOT EXISTS "pickupLocationId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD COLUMN IF NOT EXISTS "dropoffLocationId" uuid
    `);

    // Table was cleared above; safe to enforce NOT NULL.
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ALTER COLUMN "pickupLocationId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ALTER COLUMN "dropoffLocationId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_client_rates_pickupLocationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_client_rates_dropoffLocationId"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD CONSTRAINT "FK_client_rates_pickupLocationId"
        FOREIGN KEY ("pickupLocationId")
        REFERENCES "client_pickup_locations"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD CONSTRAINT "FK_client_rates_dropoffLocationId"
        FOREIGN KEY ("dropoffLocationId")
        REFERENCES "client_dropoff_locations"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "client_rate_logs"`);
    await queryRunner.query(`DELETE FROM "client_rates"`);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_client_rates_dropoffLocationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_client_rates_pickupLocationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP COLUMN IF EXISTS "dropoffLocationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP COLUMN IF EXISTS "pickupLocationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP COLUMN IF EXISTS "variableRatePercentage"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP COLUMN IF EXISTS "fixedRatePercentage"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "fuelRate" TO "fuelrate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "freightRate" TO "freightrate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "fixedRate" TO "fixedrate"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        RENAME COLUMN "variableRate" TO "variablerate"
    `);

    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD COLUMN IF NOT EXISTS "cityId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ALTER COLUMN "cityId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        DROP CONSTRAINT IF EXISTS "FK_c60e2f03fe0cfa42c8bb52356e4"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_rates"
        ADD CONSTRAINT "FK_c60e2f03fe0cfa42c8bb52356e4"
        FOREIGN KEY ("cityId") REFERENCES "cities"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }
}
