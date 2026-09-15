import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVendorProductPrice1789300000001 implements MigrationInterface {
  name = 'DropVendorProductPrice1789300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_products" DROP COLUMN "price"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_products" ADD "price" integer NOT NULL DEFAULT 0`,
    );
  }
}
