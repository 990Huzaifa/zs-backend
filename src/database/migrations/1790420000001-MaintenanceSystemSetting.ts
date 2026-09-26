import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaintenanceSystemSetting1790420000001
  implements MigrationInterface
{
  name = 'MaintenanceSystemSetting1790420000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" ADD VALUE IF NOT EXISTS 'MAINTENANCE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot remove a single enum value safely; recreate without MAINTENANCE.
    await queryRunner.query(
      `DELETE FROM "system_settings" WHERE "key" = 'MAINTENANCE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" RENAME TO "system_settings_key_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."system_settings_key_enum" AS ENUM('GEO', 'BUSINESS_INFO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "system_settings" ALTER COLUMN "key" TYPE "public"."system_settings_key_enum" USING "key"::"text"::"public"."system_settings_key_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."system_settings_key_enum_old"`,
    );
  }
}
