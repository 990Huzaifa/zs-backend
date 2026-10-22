import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add BiltyStatus.IN_TRANSIT to bilty_status_enum.
 */
export class BiltyStatusInTransit1791230000001 implements MigrationInterface {
  name = 'BiltyStatusInTransit1791230000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."bilty_status_enum"
        ADD VALUE IF NOT EXISTS 'IN_TRANSIT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove a single enum value; recreate without IN_TRANSIT.
    await queryRunner.query(`
      UPDATE "bilty"
        SET "status" = 'APPROVED'
        WHERE "status" = 'IN_TRANSIT'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."bilty_status_enum"
        RENAME TO "bilty_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."bilty_status_enum"
        AS ENUM('PENDING', 'APPROVED', 'CANCELLED', 'COMPLETED')
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "status"
        TYPE "public"."bilty_status_enum"
        USING "status"::text::"public"."bilty_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "status" SET DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."bilty_status_enum_old"
    `);
  }
}
