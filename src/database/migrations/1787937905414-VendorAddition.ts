import { MigrationInterface, QueryRunner } from "typeorm";

export class VendorAddition1787937905414 implements MigrationInterface {
    name = 'VendorAddition1787937905414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "vendor_products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "price" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7066782d8e57478144204208502" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."vendor_rates_status_enum" AS ENUM('SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "vendor_rates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendorId" uuid NOT NULL, "productId" uuid NOT NULL, "locationName" character varying, "cityId" integer NOT NULL, "price" numeric(10,2) NOT NULL, "effectiveFromDate" date NOT NULL, "status" "public"."vendor_rates_status_enum" NOT NULL DEFAULT 'SCHEDULED', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e171c0a3498f13517ce808f2306" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "vendor_rates" ADD CONSTRAINT "FK_67ee58e0373dbd170f1a44062b9" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_rates" ADD CONSTRAINT "FK_1b31efcb9292cb2bb554c88e906" FOREIGN KEY ("productId") REFERENCES "vendor_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_rates" ADD CONSTRAINT "FK_310ab257365323239fcbb573ab2" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendor_rates" DROP CONSTRAINT "FK_310ab257365323239fcbb573ab2"`);
        await queryRunner.query(`ALTER TABLE "vendor_rates" DROP CONSTRAINT "FK_1b31efcb9292cb2bb554c88e906"`);
        await queryRunner.query(`ALTER TABLE "vendor_rates" DROP CONSTRAINT "FK_67ee58e0373dbd170f1a44062b9"`);
        await queryRunner.query(`DROP TABLE "vendor_rates"`);
        await queryRunner.query(`DROP TYPE "public"."vendor_rates_status_enum"`);
        await queryRunner.query(`DROP TABLE "vendor_products"`);
    }

}
