import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoucherChequeBank1790320000001 implements MigrationInterface {
  name = 'VoucherChequeBank1790320000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_vouchers" ADD "chequeBank" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" ADD "chequeBank" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_vouchers" ADD "chequeBank" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "contra_vouchers" ADD "chequeBank" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_vouchers" ADD "chequeBank" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_vouchers" DROP COLUMN "chequeBank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contra_vouchers" DROP COLUMN "chequeBank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_vouchers" DROP COLUMN "chequeBank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" DROP COLUMN "chequeBank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_vouchers" DROP COLUMN "chequeBank"`,
    );
  }
}
