import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trip entity updates:
 * - Remove TripStatus.STARTED (migrate existing rows → IN_TRANSIT)
 * - Add TripAuditStatus + auditDate / auditRemark / auditBy
 */
export class TripAuditStatusAndDropStarted1791100000001
  implements MigrationInterface
{
  name = 'TripAuditStatusAndDropStarted1791100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing STARTED trips → IN_TRANSIT before enum shrink
    await queryRunner.query(`
      UPDATE "trips"
      SET "status" = 'IN_TRANSIT'
      WHERE "status" = 'STARTED'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."trips_status_enum" RENAME TO "trips_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."trips_status_enum" AS ENUM(
        'PENDING',
        'IN_TRANSIT',
        'COMPLETED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
        ALTER COLUMN "status" TYPE "public"."trips_status_enum"
        USING "status"::text::"public"."trips_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."trips_status_enum_old"
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."trips_auditstatus_enum" AS ENUM(
          'PENDING',
          'IN_PROGRESS',
          'RECONCILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "trips"
        ADD COLUMN IF NOT EXISTS "auditStatus"
          "public"."trips_auditstatus_enum" NOT NULL DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
        ADD COLUMN IF NOT EXISTS "auditDate" date
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
        ADD COLUMN IF NOT EXISTS "auditRemark" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
        ADD COLUMN IF NOT EXISTS "auditBy" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "auditBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "auditRemark"
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "auditDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" DROP COLUMN IF EXISTS "auditStatus"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."trips_auditstatus_enum"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."trips_status_enum" RENAME TO "trips_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."trips_status_enum" AS ENUM(
        'PENDING',
        'STARTED',
        'IN_TRANSIT',
        'COMPLETED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "trips"
        ALTER COLUMN "status" TYPE "public"."trips_status_enum"
        USING "status"::text::"public"."trips_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."trips_status_enum_old"
    `);
  }
}
