import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientModule1787768175004 implements MigrationInterface {
    name = 'ClientModule1787768175004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" DROP CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" DROP CONSTRAINT "FK_6fec362e56443e90cb701c916e1"`);
        await queryRunner.query(`CREATE TYPE "public"."client_documents_doctype_enum" AS ENUM('NTN', 'SALES_TAX_CERTIFICATE', 'AGREEMENT', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "client_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "name" character varying, "docType" "public"."client_documents_doctype_enum" NOT NULL, "file" character varying NOT NULL, "validity" date NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3452e7ead96feb85907cd0e4809" UNIQUE ("file"), CONSTRAINT "PK_783c5526a1962035adec4101c91" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."clients_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "status" "public"."clients_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ADD CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ADD CONSTRAINT "FK_6fec362e56443e90cb701c916e1" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_documents" ADD CONSTRAINT "FK_25deab70a449af0386535f617bd" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_documents" DROP CONSTRAINT "FK_25deab70a449af0386535f617bd"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" DROP CONSTRAINT "FK_6fec362e56443e90cb701c916e1"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" DROP CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40"`);
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."clients_status_enum"`);
        await queryRunner.query(`DROP TABLE "client_documents"`);
        await queryRunner.query(`DROP TYPE "public"."client_documents_doctype_enum"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ADD CONSTRAINT "FK_6fec362e56443e90cb701c916e1" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ADD CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
