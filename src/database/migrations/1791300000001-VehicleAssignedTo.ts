import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add vehicles.assignedTo (TRANSPORTATION | WAREHOUSING).
 * Existing rows default to TRANSPORTATION.
 */
export class VehicleAssignedTo1791300000001 implements MigrationInterface {
  name = 'VehicleAssignedTo1791300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."vehicles_assignedto_enum"
          AS ENUM('TRANSPORTATION', 'WAREHOUSING');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "vehicles"
        ADD COLUMN IF NOT EXISTS "assignedTo"
          "public"."vehicles_assignedto_enum"
          NOT NULL DEFAULT 'TRANSPORTATION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "assignedTo"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."vehicles_assignedto_enum"
    `);
  }
}
