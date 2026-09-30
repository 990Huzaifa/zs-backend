import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add required ownerPhone to brokers and transporters.
 */
export class BrokerTransporterOwnerPhone1790810000001
  implements MigrationInterface
{
  name = 'BrokerTransporterOwnerPhone1790810000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD "ownerPhone" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" ALTER COLUMN "ownerPhone" DROP DEFAULT`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "ownerPhone" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "ownerPhone" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "ownerPhone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" DROP COLUMN "ownerPhone"`,
    );
  }
}
