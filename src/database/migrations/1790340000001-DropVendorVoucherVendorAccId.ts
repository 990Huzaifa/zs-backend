import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVendorVoucherVendorAccId1790340000001
  implements MigrationInterface
{
  name = 'DropVendorVoucherVendorAccId1790340000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" DROP CONSTRAINT "FK_e475340e4bd0f30c1ce6c0059b2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" DROP COLUMN "vendorAccId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" ADD "vendorAccId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_vouchers" ADD CONSTRAINT "FK_e475340e4bd0f30c1ce6c0059b2" FOREIGN KEY ("vendorAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
