import { MigrationInterface, QueryRunner } from "typeorm";

export class VendorRateLog1787940494402 implements MigrationInterface {
    name = 'VendorRateLog1787940494402'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "vendor_rate_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendorRateId" uuid NOT NULL, "previousPrice" numeric(10,2), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc942a5a7aef981163385384e8b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "vendor_rate_logs" ADD CONSTRAINT "FK_ed5c08c2f8993c31f1c52c88ca9" FOREIGN KEY ("vendorRateId") REFERENCES "vendor_rates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendor_rate_logs" DROP CONSTRAINT "FK_ed5c08c2f8993c31f1c52c88ca9"`);
        await queryRunner.query(`DROP TABLE "vendor_rate_logs"`);
    }

}
