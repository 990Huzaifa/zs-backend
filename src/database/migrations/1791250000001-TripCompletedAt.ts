import { MigrationInterface, QueryRunner } from 'typeorm';

/** trips.completedAt — optional date when trip is marked COMPLETED. */
export class TripCompletedAt1791250000001 implements MigrationInterface {
  name = 'TripCompletedAt1791250000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips"
        ADD COLUMN IF NOT EXISTS "completedAt" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips"
        DROP COLUMN IF EXISTS "completedAt"
    `);
  }
}
