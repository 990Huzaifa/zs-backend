import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BUSINESS_INFO jsonb shape change:
 * - rename `address` → `primaryAddress`
 * - add `govtRegNo`, `secondaryAddress` (null when missing)
 */
export class BusinessInfoAddressFields1790840000001
  implements MigrationInterface
{
  name = 'BusinessInfoAddressFields1790840000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename legacy address → primaryAddress when primaryAddress is absent.
    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" =
        ("value" - 'address')
        || jsonb_build_object('primaryAddress', "value"->'address')
      WHERE "key" = 'BUSINESS_INFO'
        AND "value" ? 'address'
        AND NOT ("value" ? 'primaryAddress')
    `);

    // Drop leftover legacy key if both somehow exist.
    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" = "value" - 'address'
      WHERE "key" = 'BUSINESS_INFO'
        AND "value" ? 'address'
    `);

    // Ensure new keys exist.
    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" = "value" || '{"govtRegNo": null}'::jsonb
      WHERE "key" = 'BUSINESS_INFO'
        AND NOT ("value" ? 'govtRegNo')
    `);

    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" = "value" || '{"secondaryAddress": null}'::jsonb
      WHERE "key" = 'BUSINESS_INFO'
        AND NOT ("value" ? 'secondaryAddress')
    `);

    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" = "value" || '{"primaryAddress": null}'::jsonb
      WHERE "key" = 'BUSINESS_INFO'
        AND NOT ("value" ? 'primaryAddress')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename primaryAddress back to address when address is absent.
    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" =
        ("value" - 'primaryAddress' - 'secondaryAddress' - 'govtRegNo')
        || jsonb_build_object('address', "value"->'primaryAddress')
      WHERE "key" = 'BUSINESS_INFO'
        AND "value" ? 'primaryAddress'
        AND NOT ("value" ? 'address')
    `);

    await queryRunner.query(`
      UPDATE "system_settings"
      SET "value" = "value" - 'primaryAddress' - 'secondaryAddress' - 'govtRegNo'
      WHERE "key" = 'BUSINESS_INFO'
    `);
  }
}
