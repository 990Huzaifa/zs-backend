import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShopInchargeRename1790490000001 implements MigrationInterface {
  name = 'ShopInchargeRename1790490000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop" RENAME COLUMN "ownerName" TO "inchargeName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop" RENAME COLUMN "ownerPhone" TO "inchargePhone"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop" RENAME COLUMN "inchargeName" TO "ownerName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop" RENAME COLUMN "inchargePhone" TO "ownerPhone"`,
    );
  }
}
