import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseOrderLedgerEnum1790430000001
  implements MigrationInterface
{
  name = 'PurchaseOrderLedgerEnum1790430000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_INVENTORY'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_EXPENSE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_VENDOR'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot easily remove an enum value; leave as no-op.
  }
}
