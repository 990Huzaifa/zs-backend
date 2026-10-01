import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attendance UI extras + leave requests/balances.
 * Also unique (employeeId, attendanceDate) for roster queries.
 */
export class AttendanceExtrasAndLeaves1790870000001
  implements MigrationInterface
{
  name = 'AttendanceExtrasAndLeaves1790870000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "breakOutAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "breakInAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "source" character varying NOT NULL DEFAULT 'SYSTEM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "workLocation" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "notes" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "leaveType" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_attendances_employee_date" ON "attendances" ("employeeId", "attendanceDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attendances_date" ON "attendances" ("attendanceDate")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "leaveType" character varying NOT NULL,
        "durationType" character varying NOT NULL DEFAULT 'FULL_DAY',
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "days" numeric(6,2) NOT NULL DEFAULT 1,
        "reason" text NOT NULL,
        "attachmentUrl" character varying,
        "approverUserId" uuid,
        "status" character varying NOT NULL DEFAULT 'APPROVED',
        "createdBy" uuid NOT NULL,
        "notifyEmployee" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_requests_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leave_requests_employee" ON "leave_requests" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leave_requests_dates" ON "leave_requests" ("startDate", "endDate")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_balances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "year" integer NOT NULL,
        "leaveType" character varying NOT NULL,
        "entitledDays" numeric(6,2) NOT NULL DEFAULT 12,
        "usedDays" numeric(6,2) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_balances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_balances_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_balances_employee_year_type" ON "leave_balances" ("employeeId", "year", "leaveType")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendances_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendances_employee_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "leaveType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "workLocation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "breakInAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "breakOutAt"`,
    );
  }
}
