import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow drivers.licenseType to be null (helpers / unverified licenses).
 */
export class DriverLicenseTypeNullable1790560000001
  implements MigrationInterface
{
  name = 'DriverLicenseTypeNullable1790560000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "licenseType" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "drivers" SET "licenseType" = 'LTV' WHERE "licenseType" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "licenseType" SET NOT NULL`,
    );
  }
}
