import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional cityId on client pickup / dropoff locations (FK → cities.id integer).
 */
export class ClientLocationCityId1791320000001 implements MigrationInterface {
  name = 'ClientLocationCityId1791320000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "client_pickup_locations"
        ADD COLUMN IF NOT EXISTS "cityId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "client_dropoff_locations"
        ADD COLUMN IF NOT EXISTS "cityId" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "client_pickup_locations"
        DROP CONSTRAINT IF EXISTS "FK_client_pickup_locations_cityId_cities"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_pickup_locations"
        ADD CONSTRAINT "FK_client_pickup_locations_cityId_cities"
        FOREIGN KEY ("cityId") REFERENCES "cities"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "client_dropoff_locations"
        DROP CONSTRAINT IF EXISTS "FK_client_dropoff_locations_cityId_cities"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_dropoff_locations"
        ADD CONSTRAINT "FK_client_dropoff_locations_cityId_cities"
        FOREIGN KEY ("cityId") REFERENCES "cities"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_pickup_locations_cityId"
        ON "client_pickup_locations" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_dropoff_locations_cityId"
        ON "client_dropoff_locations" ("cityId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_client_pickup_locations_cityId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_client_dropoff_locations_cityId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_pickup_locations"
        DROP CONSTRAINT IF EXISTS "FK_client_pickup_locations_cityId_cities"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_dropoff_locations"
        DROP CONSTRAINT IF EXISTS "FK_client_dropoff_locations_cityId_cities"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_pickup_locations" DROP COLUMN IF EXISTS "cityId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_dropoff_locations" DROP COLUMN IF EXISTS "cityId"
    `);
  }
}
