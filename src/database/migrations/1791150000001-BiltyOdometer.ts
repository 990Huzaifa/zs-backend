import { MigrationInterface, QueryRunner } from 'typeorm';

/** bilty.odometer — optional reading; API only (not on bilty PDF). */
export class BiltyOdometer1791150000001 implements MigrationInterface {
  name = 'BiltyOdometer1791150000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD COLUMN IF NOT EXISTS "odometer" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP COLUMN IF EXISTS "odometer"
    `);
  }
}
