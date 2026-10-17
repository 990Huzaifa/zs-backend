import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * trip_maintenace_expenses (+ voucherNumber) and ledger reference types
 * TRIP_MAINTENACE_EXPENSE / TRIP_MAINTENACE_EXPENSE_VEHICLE.
 * Spelling matches entity (`maintenace`).
 */
export class TripMaintenaceExpense1791220000001 implements MigrationInterface {
  name = 'TripMaintenaceExpense1791220000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."trip_maintenace_expenses_status_enum"
          AS ENUM('PENDING', 'PAID', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trip_maintenace_expenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucherNumber" character varying,
        "tripId" uuid NOT NULL,
        "assetAccountId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "expenseDate" date NOT NULL,
        "description" character varying,
        "status" "public"."trip_maintenace_expenses_status_enum"
          NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trip_maintenace_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trip_maintenace_expenses_voucherNumber" UNIQUE ("voucherNumber")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "trip_maintenace_expenses"
          ADD CONSTRAINT "FK_trip_maintenace_expenses_tripId"
          FOREIGN KEY ("tripId") REFERENCES "trips"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "trip_maintenace_expenses"
          ADD CONSTRAINT "FK_trip_maintenace_expenses_assetAccountId"
          FOREIGN KEY ("assetAccountId") REFERENCES "chart_of_accounts"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."transactions_referencetype_enum"
        ADD VALUE IF NOT EXISTS 'TRIP_MAINTENACE_EXPENSE'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."transactions_referencetype_enum"
        ADD VALUE IF NOT EXISTS 'TRIP_MAINTENACE_EXPENSE_VEHICLE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_maintenace_expenses"
        DROP CONSTRAINT IF EXISTS "FK_trip_maintenace_expenses_assetAccountId"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_maintenace_expenses"
        DROP CONSTRAINT IF EXISTS "FK_trip_maintenace_expenses_tripId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "trip_maintenace_expenses"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."trip_maintenace_expenses_status_enum"`,
    );
    // PG cannot easily remove enum values from transactions_referencetype_enum
  }
}
