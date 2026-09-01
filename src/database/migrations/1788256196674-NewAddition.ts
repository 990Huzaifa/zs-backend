import { MigrationInterface, QueryRunner } from "typeorm";

export class NewAddition1788256196674 implements MigrationInterface {
    name = 'NewAddition1788256196674'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."employees_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."employees_maritalstatus_enum" AS ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED')`);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED')`);
        await queryRunner.query(`CREATE TABLE "employees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "firstName" character varying NOT NULL, "gender" "public"."employees_gender_enum" NOT NULL DEFAULT 'MALE', "maritalStatus" "public"."employees_maritalstatus_enum" NOT NULL DEFAULT 'SINGLE', "dateOfBirth" character varying, "joiningDate" character varying, "phone" character varying, "altPhone" character varying, "cnicNo" character varying, "address" character varying, "city" character varying, "state" character varying, "zip" character varying, "photograph" character varying, "designation" character varying, "status" "public"."employees_status_enum" NOT NULL DEFAULT 'ACTIVE', "bankName" character varying, "bankAccountNumber" character varying, "bankAccountTitle" character varying, "emergencyContactName" character varying, "emergencyContactPhone" character varying, "emergencyContactRelation" character varying, "taxNumber" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_737991e10350d9626f592894ce" UNIQUE ("userId"), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "stock_balances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "warehouseId" uuid NOT NULL, "avaiableCartons" integer NOT NULL DEFAULT '0', "damagedCartons" integer NOT NULL DEFAULT '0', "returnedCartons" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4c0d249ce58f9a559eb7df31b23" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "warehouses" ADD "pickupLocationId" uuid`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD "joiningDate" character varying`);
        await queryRunner.query(`ALTER TYPE "public"."system_settings_key_enum" RENAME TO "system_settings_key_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."system_settings_key_enum" AS ENUM('GEO', 'BUSINESS_INFO')`);
        await queryRunner.query(`ALTER TABLE "system_settings" ALTER COLUMN "key" TYPE "public"."system_settings_key_enum" USING "key"::"text"::"public"."system_settings_key_enum"`);
        await queryRunner.query(`DROP TYPE "public"."system_settings_key_enum_old"`);
        await queryRunner.query(`ALTER TABLE "warehouses" ADD CONSTRAINT "FK_24d9430a2dcf54f5122c571274b" FOREIGN KEY ("pickupLocationId") REFERENCES "client_pickup_locations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "FK_737991e10350d9626f592894cef" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_balances" ADD CONSTRAINT "FK_d949e4488d09dca62fd3561fa90" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stock_balances" DROP CONSTRAINT "FK_d949e4488d09dca62fd3561fa90"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "FK_737991e10350d9626f592894cef"`);
        await queryRunner.query(`ALTER TABLE "warehouses" DROP CONSTRAINT "FK_24d9430a2dcf54f5122c571274b"`);
        await queryRunner.query(`CREATE TYPE "public"."system_settings_key_enum_old" AS ENUM('GEO')`);
        await queryRunner.query(`ALTER TABLE "system_settings" ALTER COLUMN "key" TYPE "public"."system_settings_key_enum_old" USING "key"::"text"::"public"."system_settings_key_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."system_settings_key_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."system_settings_key_enum_old" RENAME TO "system_settings_key_enum"`);
        await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN "joiningDate"`);
        await queryRunner.query(`ALTER TABLE "warehouses" DROP COLUMN "pickupLocationId"`);
        await queryRunner.query(`DROP TABLE "stock_balances"`);
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."employees_maritalstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."employees_gender_enum"`);
    }

}
