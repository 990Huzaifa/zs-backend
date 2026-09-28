import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace TRANSFER/ONLINE with IBFT/PDC on all voucher paymentMethod enums,
 * and add nullable transactionNo to all voucher tables.
 */
export class PaymentMethodAndTransactionNo1790460000001
  implements MigrationInterface
{
  name = 'PaymentMethodAndTransactionNo1790460000001';

  private readonly tables = [
    'client_vouchers',
    'vendor_vouchers',
    'expense_vouchers',
    'contra_vouchers',
    'salary_vouchers',
    'maintenance_vouchers',
    'bilty_freights',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      const enumName = `${table}_paymentmethod_enum`;
      const tmpEnum = `${enumName}_new`;

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "paymentMethod" TYPE character varying`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "paymentMethod" = 'IBFT' WHERE "paymentMethod" = 'TRANSFER'`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "paymentMethod" = 'OTHER' WHERE "paymentMethod" = 'ONLINE'`,
      );
      await queryRunner.query(`DROP TYPE "public"."${enumName}"`);
      await queryRunner.query(
        `CREATE TYPE "public"."${tmpEnum}" AS ENUM('CASH', 'CHEQUE', 'IBFT', 'PDC', 'OTHER')`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "paymentMethod" TYPE "public"."${tmpEnum}" USING "paymentMethod"::"public"."${tmpEnum}"`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."${tmpEnum}" RENAME TO "${enumName}"`,
      );

      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "transactionNo" character varying`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...this.tables].reverse()) {
      const enumName = `${table}_paymentmethod_enum`;
      const tmpEnum = `${enumName}_old`;

      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "transactionNo"`,
      );

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "paymentMethod" TYPE character varying`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "paymentMethod" = 'TRANSFER' WHERE "paymentMethod" = 'IBFT'`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "paymentMethod" = 'ONLINE' WHERE "paymentMethod" = 'PDC'`,
      );
      await queryRunner.query(`DROP TYPE "public"."${enumName}"`);
      await queryRunner.query(
        `CREATE TYPE "public"."${tmpEnum}" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "paymentMethod" TYPE "public"."${tmpEnum}" USING "paymentMethod"::"public"."${tmpEnum}"`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."${tmpEnum}" RENAME TO "${enumName}"`,
      );
    }
  }
}
