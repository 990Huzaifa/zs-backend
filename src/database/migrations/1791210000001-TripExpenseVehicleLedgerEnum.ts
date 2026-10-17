import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vehicle cost legs for trip expenses (debit vehicle leaf under 1-2-1):
 * - TRIP_OFFICE_EXPENSE_VEHICLE
 * - TRIP_PUMP_EXPENSE_VEHICLE
 * - TRIP_MTAG_EXPENSE_VEHICLE
 * - TRIP_OTHER_EXPENSE_VEHICLE
 */
export class TripExpenseVehicleLedgerEnum1791210000001
  implements MigrationInterface
{
  name = 'TripExpenseVehicleLedgerEnum1791210000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'TRIP_OFFICE_EXPENSE_VEHICLE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'TRIP_PUMP_EXPENSE_VEHICLE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'TRIP_MTAG_EXPENSE_VEHICLE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'TRIP_OTHER_EXPENSE_VEHICLE'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot easily remove an enum value; leave as no-op.
  }
}
