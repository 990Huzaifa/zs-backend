import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional jsonb proofImages (S3 keys) on all trip expense tables.
 */
export class TripExpenseProofImages1791260000001
  implements MigrationInterface
{
  name = 'TripExpenseProofImages1791260000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'trip_office_expenses',
      'trip_pump_expenses',
      'trip_mtag_expenses',
      'trip_maintenace_expenses',
      'trip_other_expenses',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "proofImages" jsonb
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'trip_office_expenses',
      'trip_pump_expenses',
      'trip_mtag_expenses',
      'trip_maintenace_expenses',
      'trip_other_expenses',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "proofImages"
      `);
    }
  }
}
