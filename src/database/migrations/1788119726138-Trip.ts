import { MigrationInterface, QueryRunner } from "typeorm";

export class Trip1788119726138 implements MigrationInterface {
    name = 'Trip1788119726138'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."trips_status_enum" AS ENUM('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trips" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripCode" character varying NOT NULL, "odoReading" character varying, "vehicleId" uuid NOT NULL, "driverId" uuid NOT NULL, "tripDate" date NOT NULL, "status" "public"."trips_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_139269061fd21dab289b49a9df2" UNIQUE ("tripCode"), CONSTRAINT "PK_f71c231dee9c05a9522f9e840f5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_upcountry_loads_status_enum" AS ENUM('PENDING', 'LOADED', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_upcountry_loads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "clientId" uuid NOT NULL, "biltyId" uuid NOT NULL, "toDetails" character varying, "deliveryChallanNumber" character varying, "loadingDate" date, "productDescription" character varying, "address" character varying, "netWeight" numeric(12,3), "cartonCount" integer, "status" "public"."trip_upcountry_loads_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f7fc8b29504bc4fb21cd0c69f27" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_downcountry_loads_status_enum" AS ENUM('PENDING', 'LOADED', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_downcountry_loads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "clientId" uuid NOT NULL, "biltyId" uuid NOT NULL, "toDetails" character varying, "deliveryChallanNumber" character varying, "loadingDate" date, "productDescription" character varying, "address" character varying, "netWeight" numeric(12,3), "cartonCount" integer, "status" "public"."trip_downcountry_loads_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3306a1b8b22b3a57351799a7813" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_office_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_office_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "assetAccountId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "expenseDate" date NOT NULL, "description" character varying, "status" "public"."trip_office_expenses_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2c486bd5d9203c8382ae23c850d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_pump_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_pump_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "vendorId" uuid NOT NULL, "vendorAccountId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "expenseDate" date NOT NULL, "description" character varying, "status" "public"."trip_pump_expenses_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ed036c4866cf8283a6d07795066" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_fuel_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_fuel_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "vendorId" uuid NOT NULL, "vendorAccountId" uuid NOT NULL, "vendorProductId" uuid NOT NULL, "rate" numeric(12,2) NOT NULL, "quantity" numeric(12,3) NOT NULL, "amount" numeric(12,2) NOT NULL, "expenseDate" date NOT NULL, "description" character varying, "status" "public"."trip_fuel_expenses_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ae3599377e76b72e6076211729f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_mtag_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_mtag_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "assetAccountId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "expenseDate" date NOT NULL, "description" character varying, "status" "public"."trip_mtag_expenses_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7c1ae44ffc1c4791a343d933f02" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."trip_other_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "trip_other_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "assetAccountId" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "expenseDate" date NOT NULL, "description" character varying, "status" "public"."trip_other_expenses_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_776957cb30831d6f4a58da6f8f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "trips" ADD CONSTRAINT "FK_d3cea80b69fc4ecfd2273068395" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trips" ADD CONSTRAINT "FK_fc5a8911f85074a660a4304baa1" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" ADD CONSTRAINT "FK_8d1bcaa01ad2da5afdc64f7616f" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" ADD CONSTRAINT "FK_290f98cbedc67e2286e5288e028" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" ADD CONSTRAINT "FK_59e4a01af619dc3ba5ce67db16d" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" ADD CONSTRAINT "FK_6f22bd012a26495b5bbc1eabdfe" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" ADD CONSTRAINT "FK_87af03a93ade2ac31367f831743" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" ADD CONSTRAINT "FK_451e0e40b0e653a7cb450b21455" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" ADD CONSTRAINT "FK_fe014af2de887b03dc926ea029a" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" ADD CONSTRAINT "FK_4f055aefc5057a336f776846500" FOREIGN KEY ("assetAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD CONSTRAINT "FK_fa0ae75ba5f2645956c7af8049c" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD CONSTRAINT "FK_bde53051f2d83e4c1549da95e13" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD CONSTRAINT "FK_3bcd2e1f25c142fe7e1567cf6f2" FOREIGN KEY ("vendorAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" ADD CONSTRAINT "FK_ffa4e583fa1dc0917a82685ac29" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" ADD CONSTRAINT "FK_b0e58bdd78e98f052d613b76967" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" ADD CONSTRAINT "FK_0e6b0cfcdeb3f08f213ef3aa5f9" FOREIGN KEY ("vendorAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" ADD CONSTRAINT "FK_80ec5c2845780de1e20521bbfdd" FOREIGN KEY ("vendorProductId") REFERENCES "vendor_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" ADD CONSTRAINT "FK_9f86055a4c4573ee3c3f7ea10da" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" ADD CONSTRAINT "FK_764564a5c5e2bc4384ab1af2be0" FOREIGN KEY ("assetAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" ADD CONSTRAINT "FK_75b0568e087906d28cd1ac24895" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" ADD CONSTRAINT "FK_1a1a5c7bf07e079dee4922ec4ba" FOREIGN KEY ("assetAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" DROP CONSTRAINT "FK_1a1a5c7bf07e079dee4922ec4ba"`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" DROP CONSTRAINT "FK_75b0568e087906d28cd1ac24895"`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" DROP CONSTRAINT "FK_764564a5c5e2bc4384ab1af2be0"`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" DROP CONSTRAINT "FK_9f86055a4c4573ee3c3f7ea10da"`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" DROP CONSTRAINT "FK_80ec5c2845780de1e20521bbfdd"`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" DROP CONSTRAINT "FK_0e6b0cfcdeb3f08f213ef3aa5f9"`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" DROP CONSTRAINT "FK_b0e58bdd78e98f052d613b76967"`);
        await queryRunner.query(`ALTER TABLE "trip_fuel_expenses" DROP CONSTRAINT "FK_ffa4e583fa1dc0917a82685ac29"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP CONSTRAINT "FK_3bcd2e1f25c142fe7e1567cf6f2"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP CONSTRAINT "FK_bde53051f2d83e4c1549da95e13"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP CONSTRAINT "FK_fa0ae75ba5f2645956c7af8049c"`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" DROP CONSTRAINT "FK_4f055aefc5057a336f776846500"`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" DROP CONSTRAINT "FK_fe014af2de887b03dc926ea029a"`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" DROP CONSTRAINT "FK_451e0e40b0e653a7cb450b21455"`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" DROP CONSTRAINT "FK_87af03a93ade2ac31367f831743"`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" DROP CONSTRAINT "FK_6f22bd012a26495b5bbc1eabdfe"`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" DROP CONSTRAINT "FK_59e4a01af619dc3ba5ce67db16d"`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" DROP CONSTRAINT "FK_290f98cbedc67e2286e5288e028"`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" DROP CONSTRAINT "FK_8d1bcaa01ad2da5afdc64f7616f"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_fc5a8911f85074a660a4304baa1"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_d3cea80b69fc4ecfd2273068395"`);
        await queryRunner.query(`DROP TABLE "trip_other_expenses"`);
        await queryRunner.query(`DROP TYPE "public"."trip_other_expenses_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_mtag_expenses"`);
        await queryRunner.query(`DROP TYPE "public"."trip_mtag_expenses_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_fuel_expenses"`);
        await queryRunner.query(`DROP TYPE "public"."trip_fuel_expenses_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_pump_expenses"`);
        await queryRunner.query(`DROP TYPE "public"."trip_pump_expenses_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_office_expenses"`);
        await queryRunner.query(`DROP TYPE "public"."trip_office_expenses_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_downcountry_loads"`);
        await queryRunner.query(`DROP TYPE "public"."trip_downcountry_loads_status_enum"`);
        await queryRunner.query(`DROP TABLE "trip_upcountry_loads"`);
        await queryRunner.query(`DROP TYPE "public"."trip_upcountry_loads_status_enum"`);
        await queryRunner.query(`DROP TABLE "trips"`);
        await queryRunner.query(`DROP TYPE "public"."trips_status_enum"`);
    }

}
