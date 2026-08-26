import { MigrationInterface, QueryRunner } from "typeorm";

export class GEODataandVendorchange1787730409620 implements MigrationInterface {
    name = 'GEODataandVendorchange1787730409620'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "countries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "isoCode" character varying(10) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fa1376321185575cf2226b1491" ON "countries" ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dfcc02f3af5189a35e56e3363d" ON "countries" ("isoCode") `);
        await queryRunner.query(`CREATE TABLE "states" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "countryId" uuid NOT NULL, "name" character varying(100) NOT NULL, "code" character varying(20), "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cities" ("id" SERIAL NOT NULL, "stateId" uuid NOT NULL, "name" character varying(150) NOT NULL, "code" character varying(20), "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."system_settings_key_enum" AS ENUM('GEO')`);
        await queryRunner.query(`CREATE TABLE "system_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" "public"."system_settings_key_enum" NOT NULL, "value" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b1b5bc664526d375c94ce9ad43d" UNIQUE ("key"), CONSTRAINT "PK_82521f08790d248b2a80cc85d40" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "stateId" uuid`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "cityId" integer`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_76ac7edf8f44e80dff569db7321" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_25e77d61452c70b0cdbde0076f0"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_76ac7edf8f44e80dff569db7321"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "cityId"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "stateId"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "city" character varying`);
        await queryRunner.query(`DROP TABLE "system_settings"`);
        await queryRunner.query(`DROP TYPE "public"."system_settings_key_enum"`);
        await queryRunner.query(`DROP TABLE "cities"`);
        await queryRunner.query(`DROP TABLE "states"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dfcc02f3af5189a35e56e3363d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fa1376321185575cf2226b1491"`);
        await queryRunner.query(`DROP TABLE "countries"`);
    }

}
