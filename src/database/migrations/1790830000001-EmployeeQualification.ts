import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add optional `qualification` enum column on employees.
 */
export class EmployeeQualification1790830000001 implements MigrationInterface {
  name = 'EmployeeQualification1790830000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."employees_qualification_enum" AS ENUM('MATRIC', 'INTERMEDIATE', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'MPHIL', 'PHD', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "qualification" "public"."employees_qualification_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "qualification"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employees_qualification_enum"`,
    );
  }
}
