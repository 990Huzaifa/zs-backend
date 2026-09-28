import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShopCategories1790480000001 implements MigrationInterface {
  name = 'ShopCategories1790480000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shop_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "shop"
      ADD "shopCategoryId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "shop"
      ADD CONSTRAINT "FK_shop_shopCategoryId"
      FOREIGN KEY ("shopCategoryId") REFERENCES "shop_categories"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop" DROP CONSTRAINT "FK_shop_shopCategoryId"
    `);
    await queryRunner.query(`
      ALTER TABLE "shop" DROP COLUMN "shopCategoryId"
    `);
    await queryRunner.query(`DROP TABLE "shop_categories"`);
  }
}
