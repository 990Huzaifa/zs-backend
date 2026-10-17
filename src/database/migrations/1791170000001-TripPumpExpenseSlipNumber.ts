import { MigrationInterface, QueryRunner } from 'typeorm';

/** trip_pump_expenses.slipNumber — optional pump slip reference. */
export class TripPumpExpenseSlipNumber1791170000001
  implements MigrationInterface
{
  name = 'TripPumpExpenseSlipNumber1791170000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_pump_expenses"
        ADD COLUMN IF NOT EXISTS "slipNumber" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_pump_expenses"
        DROP COLUMN IF EXISTS "slipNumber"
    `);
  }
}
