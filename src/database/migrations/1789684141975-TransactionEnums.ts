import { MigrationInterface, QueryRunner } from "typeorm";

export class TransactionEnums1789684141975 implements MigrationInterface {
    name = 'TransactionEnums1789684141975'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum" RENAME TO "transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO', 'EXPENSE_VOUCHER_ASSET', 'EXPENSE_VOUCHER_EXPENSE', 'CLIENT_VOUCHER_ASSET', 'CLIENT_VOUCHER_CLIENT', 'VENDOR_VOUCHER_ASSET', 'VENDOR_VOUCHER_VENDOR', 'BILTY_EXPENSE', 'CLIENT_INVOICE_AR', 'CLIENT_INVOICE_REVENUE', 'CLIENT_INVOICE_TAX', 'CLIENT_INVOICE_ASSET', 'CLIENT_INVOICE_WHT', 'CLIENT_INVOICE_AR_CLEAR')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum" USING "referenceType"::"text"::"public"."transactions_referencetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceType", "referenceId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum_old" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE', 'CONTRA_VOUCHER_FROM', 'CONTRA_VOUCHER_TO', 'EXPENSE_VOUCHER_ASSET', 'EXPENSE_VOUCHER_EXPENSE', 'CLIENT_VOUCHER_ASSET', 'CLIENT_VOUCHER_CLIENT', 'VENDOR_VOUCHER_ASSET', 'VENDOR_VOUCHER_VENDOR', 'BILTY_EXPENSE')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "referenceType" TYPE "public"."transactions_referencetype_enum_old" USING "referenceType"::"text"::"public"."transactions_referencetype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_referencetype_enum_old" RENAME TO "transactions_referencetype_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceId", "referenceType") `);
    }

}
