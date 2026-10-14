import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bilty entity:
 * - bilty.description → nullable
 * - bilty_loadings.departureDateTime → nullable
 */
export class BiltyDescriptionAndDepartureNullable1791110000001
  implements MigrationInterface
{
  name = 'BiltyDescriptionAndDepartureNullable1791110000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "description" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_loadings"
        ALTER COLUMN "departureDateTime" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bilty"
      SET "description" = ''
      WHERE "description" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ALTER COLUMN "description" SET NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "bilty_loadings"
      SET "departureDateTime" = COALESCE("departureDateTime", NOW())
      WHERE "departureDateTime" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_loadings"
        ALTER COLUMN "departureDateTime" SET NOT NULL
    `);
  }
}
