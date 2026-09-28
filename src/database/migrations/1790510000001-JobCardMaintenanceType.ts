import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand job_cards.maintenanceType:
 * scheduled | unscheduled | routine | emergency
 * (remap legacy `unplanned` → `unscheduled`)
 */
export class JobCardMaintenanceType1790510000001
  implements MigrationInterface
{
  name = 'JobCardMaintenanceType1790510000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_cards" ALTER COLUMN "maintenanceType" TYPE character varying`,
    );
    await queryRunner.query(
      `UPDATE "job_cards" SET "maintenanceType" = 'unscheduled' WHERE "maintenanceType" = 'unplanned'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."job_cards_maintenancetype_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_cards_maintenancetype_enum_new" AS ENUM('scheduled', 'unscheduled', 'routine', 'emergency')`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ALTER COLUMN "maintenanceType" TYPE "public"."job_cards_maintenancetype_enum_new" USING "maintenanceType"::"public"."job_cards_maintenancetype_enum_new"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."job_cards_maintenancetype_enum_new" RENAME TO "job_cards_maintenancetype_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_cards" ALTER COLUMN "maintenanceType" TYPE character varying`,
    );
    await queryRunner.query(
      `UPDATE "job_cards" SET "maintenanceType" = 'unplanned' WHERE "maintenanceType" IN ('unscheduled', 'routine', 'emergency')`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."job_cards_maintenancetype_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_cards_maintenancetype_enum_old" AS ENUM('scheduled', 'unplanned')`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ALTER COLUMN "maintenanceType" TYPE "public"."job_cards_maintenancetype_enum_old" USING "maintenanceType"::"public"."job_cards_maintenancetype_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."job_cards_maintenancetype_enum_old" RENAME TO "job_cards_maintenancetype_enum"`,
    );
  }
}
