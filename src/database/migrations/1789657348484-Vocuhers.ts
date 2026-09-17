import { MigrationInterface, QueryRunner } from "typeorm";

export class Vocuhers1789657348484 implements MigrationInterface {
    name = 'Vocuhers1789657348484'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."vendor_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."vendor_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "vendor_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "voucherNumber" character varying NOT NULL, "vendorId" uuid NOT NULL, "assetAccId" uuid NOT NULL, "vendorAccId" uuid NOT NULL, "paymentMethod" "public"."vendor_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" date, "paymentDate" date NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" text, "createdBy" uuid, "status" "public"."vendor_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_75bb176312dc8146d162c8bfd6a" UNIQUE ("voucherNumber"), CONSTRAINT "PK_21f5e7a21b24176c526c7809d33" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."salary_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."salary_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "salary_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "voucherNumber" character varying NOT NULL, "employeeId" uuid NOT NULL, "assetAccId" uuid NOT NULL, "salaryAccId" uuid NOT NULL, "paymentMethod" "public"."salary_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" date, "paymentDate" date NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" text, "createdBy" uuid, "status" "public"."salary_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_87b192aa3f749a11d1b66155794" UNIQUE ("voucherNumber"), CONSTRAINT "PK_9ff76de888e4e2ec7ab03c0847f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."client_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."client_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "client_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "voucherNumber" character varying NOT NULL, "clientId" uuid NOT NULL, "assetAccId" uuid NOT NULL, "clientAccId" uuid NOT NULL, "paymentMethod" "public"."client_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" date, "paymentDate" date NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" text, "createdBy" uuid, "status" "public"."client_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f00b486c2dfac25df93c02c3ffa" UNIQUE ("voucherNumber"), CONSTRAINT "PK_5f05b22a8745927f588f949c045" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum" RENAME TO "transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO', 'EXPENSE_VOUCHER_ASSET', 'EXPENSE_VOUCHER_EXPENSE', 'CLIENT_VOUCHER_ASSET', 'CLIENT_VOUCHER_CLIENT', 'VENDOR_VOUCHER_ASSET', 'VENDOR_VOUCHER_VENDOR', 'BILTY_EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum" USING "referenceType"::"text"::"public"."transactions_referencetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceType", "referenceId") `);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" ADD CONSTRAINT "FK_d4e86cd3d51514d0f19791d0513" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" ADD CONSTRAINT "FK_16124c22018962ed6af322d0c00" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" ADD CONSTRAINT "FK_e475340e4bd0f30c1ce6c0059b2" FOREIGN KEY ("vendorAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" ADD CONSTRAINT "FK_0c7605dde0d3e6682f85ceca737" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_d78daa853a19b5506bc71caae2a" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_b4e1dcb180eed3d91ba62a6fe10" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_090ecc402353aef4c8317cfa6f2" FOREIGN KEY ("salaryAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_4c5bcfb3a20c699c37f6a670cd1" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_ed86a6249b38fbec78b037a1f44" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_7da2e801fdd09ed99cd64fa528e" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_93e0eac253ebefa20cc390e18ff" FOREIGN KEY ("clientAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_7e574a268db35187eaa371367b3" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_7e574a268db35187eaa371367b3"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_93e0eac253ebefa20cc390e18ff"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_7da2e801fdd09ed99cd64fa528e"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_ed86a6249b38fbec78b037a1f44"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_4c5bcfb3a20c699c37f6a670cd1"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_090ecc402353aef4c8317cfa6f2"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_b4e1dcb180eed3d91ba62a6fe10"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_d78daa853a19b5506bc71caae2a"`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" DROP CONSTRAINT "FK_0c7605dde0d3e6682f85ceca737"`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" DROP CONSTRAINT "FK_e475340e4bd0f30c1ce6c0059b2"`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" DROP CONSTRAINT "FK_16124c22018962ed6af322d0c00"`);
        await queryRunner.query(`ALTER TABLE "vendor_vouchers" DROP CONSTRAINT "FK_d4e86cd3d51514d0f19791d0513"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum_old" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO', 'EXPENSE_VOUCHER_ASSET', 'EXPENSE_VOUCHER_EXPENSE', 'BILTY_EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum_old" USING "referenceType"::"text"::"public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum_old" RENAME TO "transactions_referencetype_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceId", "referenceType") `);
        await queryRunner.query(`DROP TABLE "client_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."client_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."client_vouchers_paymentmethod_enum"`);
        await queryRunner.query(`DROP TABLE "salary_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."salary_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."salary_vouchers_paymentmethod_enum"`);
        await queryRunner.query(`DROP TABLE "vendor_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."vendor_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vendor_vouchers_paymentmethod_enum"`);
    }

}
