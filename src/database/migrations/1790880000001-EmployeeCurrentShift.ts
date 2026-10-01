import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Current shift lives on employees (no per-day shift_assignments roster).
 * Attendance freezes schedule + policySnapshot for the day.
 */
export class EmployeeCurrentShift1790880000001 implements MigrationInterface {
  name = 'EmployeeCurrentShift1790880000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "shiftId" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "employees"
          ADD CONSTRAINT "FK_employees_shift"
          FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employees_shift_id" ON "employees" ("shiftId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "shiftId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "scheduledStartAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "scheduledEndAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "policySnapshot" jsonb`,
    );

    // Backfill from legacy shift_assignments when present
    await queryRunner.query(`
      UPDATE "attendances" a
      SET
        "shiftId" = sa."shiftId",
        "scheduledStartAt" = sa."scheduledStartAt",
        "scheduledEndAt" = sa."scheduledEndAt",
        "policySnapshot" = sa."policySnapshot"
      FROM "shift_assignments" sa
      WHERE a."shiftAssignmentId" = sa."id"
        AND a."shiftId" IS NULL
    `);

    // Prefer latest assignment as employee's current shift
    await queryRunner.query(`
      UPDATE "employees" e
      SET "shiftId" = sub."shiftId"
      FROM (
        SELECT DISTINCT ON ("employeeId") "employeeId", "shiftId"
        FROM "shift_assignments"
        ORDER BY "employeeId", "workDate" DESC
      ) sub
      WHERE e."id" = sub."employeeId"
        AND e."shiftId" IS NULL
    `);

    // Stub any remaining attendance rows that had no assignment (should be rare)
    await queryRunner.query(`
      UPDATE "attendances" a
      SET
        "shiftId" = e."shiftId",
        "scheduledStartAt" = COALESCE(a."scheduledStartAt", (a."attendanceDate"::text || ' 00:00:00+00')::timestamptz),
        "scheduledEndAt" = COALESCE(a."scheduledEndAt", (a."attendanceDate"::text || ' 23:59:00+00')::timestamptz),
        "policySnapshot" = COALESCE(a."policySnapshot", '{}'::jsonb)
      FROM "employees" e
      WHERE a."employeeId" = e."id"
        AND a."shiftId" IS NULL
        AND e."shiftId" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "FK_29c92620fd9ad579ec8c8d78b98"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_29c92620fd9ad579ec8c8d78b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "REL_29c92620fd9ad579ec8c8d78b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "shiftAssignmentId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendances" ALTER COLUMN "shiftId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ALTER COLUMN "scheduledStartAt" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ALTER COLUMN "scheduledEndAt" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ALTER COLUMN "policySnapshot" SET NOT NULL`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "attendances"
          ADD CONSTRAINT "FK_attendances_shift"
          FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attendances_shift_id" ON "attendances" ("shiftId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "shift_assignments" DROP CONSTRAINT IF EXISTS "FK_5a3da3ffc7e3502cfeab212b043"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shift_assignments" DROP CONSTRAINT IF EXISTS "FK_647779813dec7e65a4f57bf878f"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_assignments"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shift_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "shiftId" uuid NOT NULL,
        "workDate" date NOT NULL,
        "scheduledStartAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "scheduledEndAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "policySnapshot" jsonb NOT NULL,
        CONSTRAINT "PK_shift_assignments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "shift_assignments"
        ADD CONSTRAINT "FK_shift_assignments_employee"
        FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "shift_assignments"
        ADD CONSTRAINT "FK_shift_assignments_shift"
        FOREIGN KEY ("shiftId") REFERENCES "shifts"("id")
    `);

    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "shiftAssignmentId" uuid`,
    );

    // Recreate one assignment per attendance for rollback
    await queryRunner.query(`
      INSERT INTO "shift_assignments" ("id", "employeeId", "shiftId", "workDate", "scheduledStartAt", "scheduledEndAt", "policySnapshot")
      SELECT uuid_generate_v4(), a."employeeId", a."shiftId", a."attendanceDate", a."scheduledStartAt", a."scheduledEndAt", a."policySnapshot"
      FROM "attendances" a
    `);
    await queryRunner.query(`
      UPDATE "attendances" a
      SET "shiftAssignmentId" = sa."id"
      FROM "shift_assignments" sa
      WHERE sa."employeeId" = a."employeeId"
        AND sa."workDate" = a."attendanceDate"
    `);

    await queryRunner.query(
      `ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "FK_attendances_shift"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attendances_shift_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "policySnapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "scheduledEndAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "scheduledStartAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "shiftId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "attendances" ALTER COLUMN "shiftAssignmentId" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "attendances"
        ADD CONSTRAINT "FK_29c92620fd9ad579ec8c8d78b98"
        FOREIGN KEY ("shiftAssignmentId") REFERENCES "shift_assignments"("id")
    `);

    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_employees_shift"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employees_shift_id"`);
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "shiftId"`,
    );
  }
}
