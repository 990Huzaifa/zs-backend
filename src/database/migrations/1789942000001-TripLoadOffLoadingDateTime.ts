import { MigrationInterface, QueryRunner } from 'typeorm';

export class TripLoadOffLoadingDateTime1789942000001
  implements MigrationInterface
{
  name = 'TripLoadOffLoadingDateTime1789942000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trip_upcountry_loads" ADD "offLoadingDateTime" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_downcountry_loads" ADD "offLoadingDateTime" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trip_downcountry_loads" DROP COLUMN "offLoadingDateTime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_upcountry_loads" DROP COLUMN "offLoadingDateTime"`,
    );
  }
}
