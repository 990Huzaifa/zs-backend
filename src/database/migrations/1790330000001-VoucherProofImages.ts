import { MigrationInterface, QueryRunner } from 'typeorm';

export class VoucherProofImages1790330000001 implements MigrationInterface {
  name = 'VoucherProofImages1790330000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_vouchers" ADD "proofImages" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" ADD "proofImages" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_vouchers" ADD "proofImages" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "contra_vouchers" ADD "proofImages" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_vouchers" ADD "proofImages" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_vouchers" DROP COLUMN "proofImages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contra_vouchers" DROP COLUMN "proofImages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_vouchers" DROP COLUMN "proofImages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" DROP COLUMN "proofImages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_vouchers" DROP COLUMN "proofImages"`,
    );
  }
}
