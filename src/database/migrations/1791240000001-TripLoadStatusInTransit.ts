import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add TripLoadStatus.IN_TRANSIT to UC/DC load status enums.
 */
export class TripLoadStatusInTransit1791240000001
  implements MigrationInterface
{
  name = 'TripLoadStatusInTransit1791240000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."trip_upcountry_loads_status_enum"
        ADD VALUE IF NOT EXISTS 'IN_TRANSIT'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."trip_downcountry_loads_status_enum"
        ADD VALUE IF NOT EXISTS 'IN_TRANSIT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove a single enum value; recreate without IN_TRANSIT.
    await this.recreateLoadStatusEnum(
      queryRunner,
      'trip_upcountry_loads',
      'trip_upcountry_loads_status_enum',
    );
    await this.recreateLoadStatusEnum(
      queryRunner,
      'trip_downcountry_loads',
      'trip_downcountry_loads_status_enum',
    );
  }

  private async recreateLoadStatusEnum(
    queryRunner: QueryRunner,
    table: string,
    enumName: string,
  ): Promise<void> {
    await queryRunner.query(`
      UPDATE "${table}"
        SET "status" = 'LOADED'
        WHERE "status" = 'IN_TRANSIT'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."${enumName}"
        RENAME TO "${enumName}_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."${enumName}"
        AS ENUM('PENDING', 'LOADED', 'COMPLETED', 'CANCELLED')
    `);
    await queryRunner.query(`
      ALTER TABLE "${table}"
        ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "${table}"
        ALTER COLUMN "status"
        TYPE "public"."${enumName}"
        USING "status"::text::"public"."${enumName}"
    `);
    await queryRunner.query(`
      ALTER TABLE "${table}"
        ALTER COLUMN "status" SET DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."${enumName}_old"
    `);
  }
}
