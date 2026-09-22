import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientPaymentClearingDays1789943000001
  implements MigrationInterface
{
  name = 'ClientPaymentClearingDays1789943000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "paymentClearingDays" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" DROP COLUMN "paymentClearingDays"`,
    );
  }
}
