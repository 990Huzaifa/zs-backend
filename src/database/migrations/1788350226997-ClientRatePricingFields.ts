import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientRatePricingFields1788350226997 implements MigrationInterface {
    name = 'ClientRatePricingFields1788350226997'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "vendorProductId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "fuelrate" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "fixedrate" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "variablerate" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "freightrate" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD CONSTRAINT "FK_bfaf4c7b3b4709583cab24b7df8" FOREIGN KEY ("vendorProductId") REFERENCES "vendor_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_rates" DROP CONSTRAINT "FK_bfaf4c7b3b4709583cab24b7df8"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "freightrate"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "variablerate"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "fixedrate"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "fuelrate"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "vendorProductId"`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "price" numeric(10,2) NOT NULL`);
    }

}
