import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientInvoicePurpose1789930000001 implements MigrationInterface {
  name = 'ClientInvoicePurpose1789930000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_invoices" ADD "purpose" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_invoices" DROP COLUMN "purpose"`,
    );
  }
}
