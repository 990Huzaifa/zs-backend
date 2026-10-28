import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add DOCUMENT_ONLINE_VERIFICATION to system_settings_key_enum.
 * Default row is created lazily by SystemSettingService (enabled: true).
 */
export class DocumentOnlineVerificationSetting1791270000001
  implements MigrationInterface
{
  name = 'DocumentOnlineVerificationSetting1791270000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."system_settings_key_enum"
        ADD VALUE IF NOT EXISTS 'DOCUMENT_ONLINE_VERIFICATION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_settings"
        WHERE "key" = 'DOCUMENT_ONLINE_VERIFICATION'
    `);
    // Enum value cannot be removed without recreating the type; leave value in place.
  }
}
