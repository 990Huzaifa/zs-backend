import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make broker/transporter ownerPhone nullable (optional).
 * Converts existing empty-string placeholders to NULL.
 */
export class BrokerTransporterOwnerPhoneNullable1790820000001
  implements MigrationInterface
{
  name = 'BrokerTransporterOwnerPhoneNullable1790820000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brokers" ALTER COLUMN "ownerPhone" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "brokers" SET "ownerPhone" = NULL WHERE "ownerPhone" = ''`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "ownerPhone" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "transporters" SET "ownerPhone" = NULL WHERE "ownerPhone" = ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "brokers" SET "ownerPhone" = '' WHERE "ownerPhone" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" ALTER COLUMN "ownerPhone" SET NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "transporters" SET "ownerPhone" = '' WHERE "ownerPhone" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "ownerPhone" SET NOT NULL`,
    );
  }
}
