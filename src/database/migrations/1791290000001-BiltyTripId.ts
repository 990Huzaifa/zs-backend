import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bilty.tripId — optional FK to trips (denormalized assignment from UC/DC loads).
 * Backfills from existing non-cancelled trip loads.
 */
export class BiltyTripId1791290000001 implements MigrationInterface {
  name = 'BiltyTripId1791290000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "tripId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_tripId_trips"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD CONSTRAINT "FK_bilty_tripId_trips"
        FOREIGN KEY ("tripId") REFERENCES "trips"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bilty_tripId"
        ON "bilty" ("tripId")
    `);

    // Prefer upcountry trip; fall back to downcountry if no UC load.
    await queryRunner.query(`
      UPDATE "bilty" b
      SET "tripId" = src."tripId"
      FROM (
        SELECT DISTINCT ON (x."biltyId")
          x."biltyId",
          x."tripId"
        FROM (
          SELECT ul."biltyId", ul."tripId", 1 AS ord
          FROM "trip_upcountry_loads" ul
          WHERE ul.status::text <> 'CANCELLED'
          UNION ALL
          SELECT dl."biltyId", dl."tripId", 2 AS ord
          FROM "trip_downcountry_loads" dl
          WHERE dl.status::text <> 'CANCELLED'
        ) x
        ORDER BY x."biltyId", x.ord, x."tripId"
      ) src
      WHERE b.id = src."biltyId"
        AND b."tripId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_bilty_tripId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_tripId_trips"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP COLUMN IF EXISTS "tripId"
    `);
  }
}
