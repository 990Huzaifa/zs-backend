import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ledger reference types for payroll approve accrual:
 * - PAYROLL_SALARY_EXPENSE (debit 5-1)
 * - PAYROLL_EMPLOYEE_PAYABLE (credit employee leaf under 2-1-2)
 */
export class PayrollLedgerEnum1790850000001 implements MigrationInterface {
  name = 'PayrollLedgerEnum1790850000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PAYROLL_SALARY_EXPENSE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PAYROLL_EMPLOYEE_PAYABLE'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot easily remove an enum value; leave as no-op.
  }
}
