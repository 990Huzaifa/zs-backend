import { MigrationInterface, QueryRunner } from 'typeorm';

export class PayrollSystemSetting1790800000001 implements MigrationInterface {
  name = 'PayrollSystemSetting1790800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" ADD VALUE IF NOT EXISTS 'PAYROLL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_settings" WHERE "key" = 'PAYROLL'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" RENAME TO "system_settings_key_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."system_settings_key_enum" AS ENUM('GEO', 'BUSINESS_INFO', 'MAINTENANCE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "system_settings" ALTER COLUMN "key" TYPE "public"."system_settings_key_enum" USING "key"::"text"::"public"."system_settings_key_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."system_settings_key_enum_old"`,
    );
  }
}
