import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop cartonCount from trip UC/DC loads — use bilty.noOfPackages instead.
 */
export class TripLoadDropCartonCount1791500000001
  implements MigrationInterface
{
  name = 'TripLoadDropCartonCount1791500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        DROP COLUMN IF EXISTS "cartonCount"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        DROP COLUMN IF EXISTS "cartonCount"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        ADD COLUMN IF NOT EXISTS "cartonCount" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        ADD COLUMN IF NOT EXISTS "cartonCount" integer
    `);

    // Best-effort restore from linked bilty.noOfPackages
    await queryRunner.query(`
      UPDATE "trip_upcountry_loads" ul
      SET "cartonCount" = CASE
        WHEN b."noOfPackages" ~ '^[0-9]+$'
          THEN CAST(b."noOfPackages" AS integer)
        ELSE NULL
      END
      FROM bilty b
      WHERE b.id = ul."biltyId"
        AND ul."cartonCount" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "trip_downcountry_loads" dl
      SET "cartonCount" = CASE
        WHEN b."noOfPackages" ~ '^[0-9]+$'
          THEN CAST(b."noOfPackages" AS integer)
        ELSE NULL
      END
      FROM bilty b
      WHERE b.id = dl."biltyId"
        AND dl."cartonCount" IS NULL
    `);
  }
}
