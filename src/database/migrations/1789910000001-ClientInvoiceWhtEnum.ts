import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientInvoiceWhtEnum1789910000001 implements MigrationInterface {
  name = 'ClientInvoiceWhtEnum1789910000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'CLIENT_INVOICE_WHT'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot easily remove an enum value; leave as no-op.
  }
}
