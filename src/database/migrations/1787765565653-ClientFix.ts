import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientFix1787765565653 implements MigrationInterface {
    name = 'ClientFix1787765565653'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tax_rules_type_enum" AS ENUM('SALES_TAX', 'SERVICE_TAX', 'OTHER_TAX')`);
        await queryRunner.query(`CREATE TYPE "public"."tax_rules_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "tax_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "code" character varying NOT NULL, "type" "public"."tax_rules_type_enum" NOT NULL, "authority" character varying NOT NULL, "rate" numeric(8,4) NOT NULL, "effectiveFrom" date NOT NULL, "effectiveTo" date, "status" "public"."tax_rules_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c01e23832428144fb7a481db0c5" UNIQUE ("code"), CONSTRAINT "PK_29b500604ee0ac9e162de1bfa6d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "client_sale_tax_types" ("clientId" uuid NOT NULL, "taxRuleId" uuid NOT NULL, CONSTRAINT "PK_84792c31ff125f47aa12766c294" PRIMARY KEY ("clientId", "taxRuleId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5ef3840e06b6ba3f95516860f4" ON "client_sale_tax_types" ("clientId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f2ddae15b5828dbdf1f130406b" ON "client_sale_tax_types" ("taxRuleId") `);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "saleTaxType"`);
        await queryRunner.query(`ALTER TABLE "client_sale_tax_types" ADD CONSTRAINT "FK_5ef3840e06b6ba3f95516860f4b" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "client_sale_tax_types" ADD CONSTRAINT "FK_f2ddae15b5828dbdf1f130406be" FOREIGN KEY ("taxRuleId") REFERENCES "tax_rules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_sale_tax_types" DROP CONSTRAINT "FK_f2ddae15b5828dbdf1f130406be"`);
        await queryRunner.query(`ALTER TABLE "client_sale_tax_types" DROP CONSTRAINT "FK_5ef3840e06b6ba3f95516860f4b"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "saleTaxType" character varying NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f2ddae15b5828dbdf1f130406b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5ef3840e06b6ba3f95516860f4"`);
        await queryRunner.query(`DROP TABLE "client_sale_tax_types"`);
        await queryRunner.query(`DROP TABLE "tax_rules"`);
        await queryRunner.query(`DROP TYPE "public"."tax_rules_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tax_rules_type_enum"`);
    }

}
