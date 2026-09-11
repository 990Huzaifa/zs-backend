import { MigrationInterface, QueryRunner } from "typeorm";

export class NewUpdates1789104217977 implements MigrationInterface {
    name = 'NewUpdates1789104217977'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."employee_attendance_status_enum" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEK_OFF')`);
        await queryRunner.query(`CREATE TYPE "public"."employee_attendance_source_enum" AS ENUM('MANUAL', 'WEB', 'MOBILE', 'BIOMETRIC')`);
        await queryRunner.query(`CREATE TABLE "employee_attendance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "employeeId" uuid NOT NULL, "attendanceDate" date NOT NULL, "status" "public"."employee_attendance_status_enum" NOT NULL, "checkIn" TIMESTAMP, "checkOut" TIMESTAMP, "workedMinutes" integer, "lateMinutes" integer NOT NULL DEFAULT '0', "overtimeMinutes" integer NOT NULL DEFAULT '0', "earlyLeaveMinutes" integer NOT NULL DEFAULT '0', "remarks" character varying, "source" "public"."employee_attendance_source_enum" NOT NULL DEFAULT 'MANUAL', "markedById" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ad955fbb21ed8c69dcc4cd8326b" UNIQUE ("employeeId", "attendanceDate"), CONSTRAINT "PK_11b4f6ec9e3eda9fd57699ce687" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bilty_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "biltyId" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "description" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d73acbc9b758630987d38ec96b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."expense_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."expense_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "expense_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "voucherNumber" character varying NOT NULL, "assetAccId" uuid NOT NULL, "expenseAccId" uuid NOT NULL, "paymentMethod" "public"."expense_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" date, "paymentDate" date NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" text, "createdBy" uuid, "status" "public"."expense_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3b11dc24b17d9caf99ac23dc47e" UNIQUE ("voucherNumber"), CONSTRAINT "PK_364d488d83ef72cbb7af1694c2c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."employees_status_enum" RENAME TO "employees_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'RESIGNED')`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" TYPE "public"."employees_status_enum" USING "status"::"text"::"public"."employees_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum_old"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum" RENAME TO "transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO', 'EXPENSE_VOUCHER_ASSET', 'EXPENSE_VOUCHER_EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum" USING "referenceType"::"text"::"public"."transactions_referencetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceType", "referenceId") `);
        await queryRunner.query(`ALTER TABLE "employee_attendance" ADD CONSTRAINT "FK_0715da180097991e26a70fff7d6" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_attendance" ADD CONSTRAINT "FK_922c58a414e6550695ee59a1d53" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_expenses" ADD CONSTRAINT "FK_2beddbb8cd4aa7f960c743bd139" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_vouchers" ADD CONSTRAINT "FK_d15eb464b3d012a061f574acafd" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_vouchers" ADD CONSTRAINT "FK_709977c7a15eb7961a064286d8d" FOREIGN KEY ("expenseAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_vouchers" ADD CONSTRAINT "FK_2f6e91149d50129ce50943ef2a6" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "expense_vouchers" DROP CONSTRAINT "FK_2f6e91149d50129ce50943ef2a6"`);
        await queryRunner.query(`ALTER TABLE "expense_vouchers" DROP CONSTRAINT "FK_709977c7a15eb7961a064286d8d"`);
        await queryRunner.query(`ALTER TABLE "expense_vouchers" DROP CONSTRAINT "FK_d15eb464b3d012a061f574acafd"`);
        await queryRunner.query(`ALTER TABLE "bilty_expenses" DROP CONSTRAINT "FK_2beddbb8cd4aa7f960c743bd139"`);
        await queryRunner.query(`ALTER TABLE "employee_attendance" DROP CONSTRAINT "FK_922c58a414e6550695ee59a1d53"`);
        await queryRunner.query(`ALTER TABLE "employee_attendance" DROP CONSTRAINT "FK_0715da180097991e26a70fff7d6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum_old" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum_old" USING "referenceType"::"text"::"public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum_old" RENAME TO "transactions_referencetype_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceId", "referenceType") `);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum_old" AS ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED')`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" TYPE "public"."employees_status_enum_old" USING "status"::"text"::"public"."employees_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."employees_status_enum_old" RENAME TO "employees_status_enum"`);
        await queryRunner.query(`DROP TABLE "expense_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."expense_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."expense_vouchers_paymentmethod_enum"`);
        await queryRunner.query(`DROP TABLE "bilty_expenses"`);
        await queryRunner.query(`DROP TABLE "employee_attendance"`);
        await queryRunner.query(`DROP TYPE "public"."employee_attendance_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."employee_attendance_status_enum"`);
    }

}
