import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link brokers to a system user (hand-in-hand create, like drivers).
 * Existing brokers keep userId NULL until next update creates/links a user.
 */
export class BrokerUserId1790830000001 implements MigrationInterface {
  name = 'BrokerUserId1790830000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD "userId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD CONSTRAINT "UQ_brokers_userId" UNIQUE ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD CONSTRAINT "FK_brokers_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brokers" DROP CONSTRAINT "FK_brokers_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" DROP CONSTRAINT "UQ_brokers_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" DROP COLUMN "userId"`,
    );
  }
}
