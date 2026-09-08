import { MigrationInterface, QueryRunner } from "typeorm";

export class ContraVoucher1788786991837 implements MigrationInterface {
    name = 'ContraVoucher1788786991837'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."contra_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."contra_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "contra_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "voucherNumber" character varying NOT NULL, "fromAccId" uuid NOT NULL, "toAccId" uuid NOT NULL, "paymentMethod" "public"."contra_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" date, "paymentDate" date NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" text, "createdBy" uuid, "status" "public"."contra_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3025f9202a6359c7192637f762c" UNIQUE ("voucherNumber"), CONSTRAINT "PK_47e28b49efd3414cdb6bab9fb3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum" RENAME TO "transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum" USING "referenceType"::"text"::"public"."transactions_referencetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceType", "referenceId") `);
        await queryRunner.query(`ALTER TABLE "contra_vouchers" ADD CONSTRAINT "FK_7173fde2998f6a46636cf877818" FOREIGN KEY ("fromAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contra_vouchers" ADD CONSTRAINT "FK_1eb98a5e5eeed6e53ec9d66ac34" FOREIGN KEY ("toAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contra_vouchers" ADD CONSTRAINT "FK_928e363f843caab6860ba99c790" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contra_vouchers" DROP CONSTRAINT "FK_928e363f843caab6860ba99c790"`);
        await queryRunner.query(`ALTER TABLE "contra_vouchers" DROP CONSTRAINT "FK_1eb98a5e5eeed6e53ec9d66ac34"`);
        await queryRunner.query(`ALTER TABLE "contra_vouchers" DROP CONSTRAINT "FK_7173fde2998f6a46636cf877818"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum_old" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum_old" USING "referenceType"::"text"::"public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum_old" RENAME TO "transactions_referencetype_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceId", "referenceType") `);
        await queryRunner.query(`DROP TABLE "contra_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."contra_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contra_vouchers_paymentmethod_enum"`);
    }

}
