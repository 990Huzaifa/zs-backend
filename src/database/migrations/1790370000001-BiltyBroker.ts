import { MigrationInterface, QueryRunner } from 'typeorm';

export class BiltyBroker1790370000001 implements MigrationInterface {
  name = 'BiltyBroker1790370000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty" ADD "brokerId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" ADD CONSTRAINT "FK_bilty_brokerId" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP CONSTRAINT "FK_bilty_brokerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP COLUMN "brokerId"`,
    );
  }
}
