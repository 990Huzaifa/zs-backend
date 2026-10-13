import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add expense_vouchers.expenseType (VEHICLE | OTHER). */
export class ExpenseVoucherExpenseType1791090000001
  implements MigrationInterface
{
  name = 'ExpenseVoucherExpenseType1791090000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."expense_vouchers_expensetype_enum"
          AS ENUM('VEHICLE', 'OTHER');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "expense_vouchers"
        ADD COLUMN IF NOT EXISTS "expenseType"
          "public"."expense_vouchers_expensetype_enum"
          NOT NULL DEFAULT 'OTHER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_vouchers" DROP COLUMN IF EXISTS "expenseType"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."expense_vouchers_expensetype_enum"
    `);
  }
}
