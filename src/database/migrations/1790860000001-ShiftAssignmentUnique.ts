import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One shift assignment per employee per work date.
 * Also adds lookup indexes for roster / calendar queries.
 */
export class ShiftAssignmentUnique1790860000001 implements MigrationInterface {
  name = 'ShiftAssignmentUnique1790860000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_shift_assignments_employee_work_date" ON "shift_assignments" ("employeeId", "workDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_shift_assignments_work_date" ON "shift_assignments" ("workDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_shift_assignments_shift_id" ON "shift_assignments" ("shiftId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_shift_assignments_shift_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_shift_assignments_work_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_shift_assignments_employee_work_date"`,
    );
  }
}
