import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shift lives only on employees. Attendance stores frozen schedule/policy
 * for the day — no shiftId column on attendances.
 */
export class DropAttendanceShiftId1790890000001 implements MigrationInterface {
  name = 'DropAttendanceShiftId1790890000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "FK_attendances_shift"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendances_shift_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendances" DROP COLUMN IF EXISTS "shiftId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "shiftId" uuid`,
    );
    await queryRunner.query(`
      UPDATE "attendances" a
      SET "shiftId" = e."shiftId"
      FROM "employees" e
      WHERE a."employeeId" = e.id
        AND a."shiftId" IS NULL
        AND e."shiftId" IS NOT NULL
    `);
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
  }
}
