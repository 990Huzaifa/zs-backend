import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bilty.deliveryChallanNumber — synced from connected non-cancelled trip UC/DC load.
 */
export class BiltyDeliveryChallanNumber1791350000001
  implements MigrationInterface
{
  name = 'BiltyDeliveryChallanNumber1791350000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "deliveryChallanNumber" character varying
    `);

    // Prefer UC load DC; fall back to DC load. Non-cancelled only.
    await queryRunner.query(`
      UPDATE "bilty" b
      SET "deliveryChallanNumber" = src."deliveryChallanNumber"
      FROM (
        SELECT DISTINCT ON (x."biltyId")
          x."biltyId",
          x."deliveryChallanNumber"
        FROM (
          SELECT
            ul."biltyId",
            ul."deliveryChallanNumber",
            1 AS priority
          FROM "trip_upcountry_loads" ul
          WHERE ul.status::text <> 'CANCELLED'
            AND ul."deliveryChallanNumber" IS NOT NULL
            AND TRIM(ul."deliveryChallanNumber") <> ''
          UNION ALL
          SELECT
            dl."biltyId",
            dl."deliveryChallanNumber",
            2 AS priority
          FROM "trip_downcountry_loads" dl
          WHERE dl.status::text <> 'CANCELLED'
            AND dl."deliveryChallanNumber" IS NOT NULL
            AND TRIM(dl."deliveryChallanNumber") <> ''
        ) x
        ORDER BY x."biltyId", x.priority ASC
      ) src
      WHERE b.id = src."biltyId"
        AND (
          b."deliveryChallanNumber" IS NULL
          OR TRIM(b."deliveryChallanNumber") = ''
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP COLUMN IF EXISTS "deliveryChallanNumber"
    `);
  }
}
