import { MigrationInterface, QueryRunner } from 'typeorm';

/** trip_downcountry_loads.fromDetails — same as upcountry. */
export class TripDowncountryLoadFromDetails1791200000001
  implements MigrationInterface
{
  name = 'TripDowncountryLoadFromDetails1791200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        ADD COLUMN IF NOT EXISTS "fromDetails" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_downcountry_loads"
        DROP COLUMN IF EXISTS "fromDetails"
    `);
  }
}
