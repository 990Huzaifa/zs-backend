import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add optional (nullable) ownerPhone to brokers and transporters.
 * Fresh installs get nullable; already-applied DBs are fixed by
 * BrokerTransporterOwnerPhoneNullable1790820000001.
 */
export class BrokerTransporterOwnerPhone1790810000001
  implements MigrationInterface
{
  name = 'BrokerTransporterOwnerPhone1790810000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD "ownerPhone" character varying(255)`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "ownerPhone" character varying(255)`,
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
