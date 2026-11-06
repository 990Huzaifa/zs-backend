import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop netWeight from trip UC/DC loads — use bilty.totalWeight instead.
 */
export class TripLoadDropNetWeight1791510000001
  implements MigrationInterface
{
  name = 'TripLoadDropNetWeight1791510000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        DROP COLUMN IF EXISTS "netWeight"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        DROP COLUMN IF EXISTS "netWeight"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        ADD COLUMN IF NOT EXISTS "netWeight" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        ADD COLUMN IF NOT EXISTS "netWeight" character varying
    `);

    await queryRunner.query(`
      UPDATE "trip_upcountry_loads" ul
      SET "netWeight" = NULLIF(TRIM(b."totalWeight"), '')
      FROM bilty b
      WHERE b.id = ul."biltyId"
        AND ul."netWeight" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "trip_downcountry_loads" dl
      SET "netWeight" = NULLIF(TRIM(b."totalWeight"), '')
      FROM bilty b
      WHERE b.id = dl."biltyId"
        AND dl."netWeight" IS NULL
    `);
  }
}
