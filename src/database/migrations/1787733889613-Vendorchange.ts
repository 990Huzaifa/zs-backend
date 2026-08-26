import { MigrationInterface, QueryRunner } from "typeorm";

export class Vendorchange1787733889613 implements MigrationInterface {
    name = 'Vendorchange1787733889613'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0"`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "vendorCategoryId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "stateId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "cityId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3" FOREIGN KEY ("vendorCategoryId") REFERENCES "vendor_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3"`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "cityId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "stateId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "vendorCategoryId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3" FOREIGN KEY ("vendorCategoryId") REFERENCES "vendor_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
