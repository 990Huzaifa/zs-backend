import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loose-couple drivers on bilty + trip_drivers:
 * - driverId becomes nullable (system driver optional)
 * - driverName / driverPhone for manual drivers
 */
export class BiltyTripDriverLooseCoupling1791460000001
  implements MigrationInterface
{
  name = 'BiltyTripDriverLooseCoupling1791460000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- bilty ---
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "driverName" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "driverPhone" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "driverId" DROP NOT NULL
    `);

    // --- trip_drivers ---
    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        ADD COLUMN IF NOT EXISTS "driverName" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        ADD COLUMN IF NOT EXISTS "driverPhone" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        ALTER COLUMN "driverId" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore NOT NULL only where system driver is present; block if manual-only rows exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "bilty" WHERE "driverId" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert: bilty rows with null driverId exist';
        END IF;
        IF EXISTS (
          SELECT 1 FROM "trip_drivers" WHERE "driverId" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert: trip_drivers rows with null driverId exist';
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "driverId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP COLUMN IF EXISTS "driverPhone"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP COLUMN IF EXISTS "driverName"
    `);

    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        ALTER COLUMN "driverId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        DROP COLUMN IF EXISTS "driverPhone"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_drivers"
        DROP COLUMN IF EXISTS "driverName"
    `);
  }
}
