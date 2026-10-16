import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bilty.loadType = UP_COUNTRY | DOWN_COUNTRY
 * for trip UC/DC bilty pickers.
 */
export class BiltyLoadType1791140000001 implements MigrationInterface {
  name = 'BiltyLoadType1791140000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."bilty_loadtype_enum"
          AS ENUM('UP_COUNTRY', 'DOWN_COUNTRY');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "loadType"
        "public"."bilty_loadtype_enum" NOT NULL DEFAULT 'UP_COUNTRY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP COLUMN IF EXISTS "loadType"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."bilty_loadtype_enum"
    `);
  }
}
