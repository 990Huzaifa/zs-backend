import { MigrationInterface, QueryRunner } from 'typeorm';

/** trip_upcountry_loads.fromDetails — optional from/origin details. */
export class TripUpcountryLoadFromDetails1791180000001
  implements MigrationInterface
{
  name = 'TripUpcountryLoadFromDetails1791180000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        ADD COLUMN IF NOT EXISTS "fromDetails" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_upcountry_loads"
        DROP COLUMN IF EXISTS "fromDetails"
    `);
  }
}
