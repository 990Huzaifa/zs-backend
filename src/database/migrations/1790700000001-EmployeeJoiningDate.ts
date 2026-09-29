import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add nullable joiningDate on employees (HR join date).
 * When create-new with DRIVER role, the same value is also stored on drivers.joiningDate.
 */
export class EmployeeJoiningDate1790700000001 implements MigrationInterface {
  name = 'EmployeeJoiningDate1790700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "joiningDate" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "joiningDate"`,
    );
  }
}
