import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add employee profile fields to match current entity:
 * employmentType, gender, maritalStatus, dateOfBirth
 */
export class EmployeeProfileFields1790540000001
  implements MigrationInterface
{
  name = 'EmployeeProfileFields1790540000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."employees_employmenttype_enum" AS ENUM('PERMANENT', 'CONTRACT', 'PROBATION', 'PART_TIME', 'DAILY_WAGE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "employmentType" "public"."employees_employmenttype_enum" NOT NULL DEFAULT 'PERMANENT'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."employees_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "gender" "public"."employees_gender_enum" NOT NULL DEFAULT 'MALE'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."employees_maritalstatus_enum" AS ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "maritalStatus" "public"."employees_maritalstatus_enum" NOT NULL DEFAULT 'SINGLE'`,
    );

    await queryRunner.query(
      `ALTER TABLE "employees" ADD "dateOfBirth" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "dateOfBirth"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "maritalStatus"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employees_maritalstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "gender"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employees_gender_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "employmentType"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employees_employmenttype_enum"`,
    );
  }
}
