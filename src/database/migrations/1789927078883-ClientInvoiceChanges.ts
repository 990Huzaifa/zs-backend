import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientInvoiceChanges1789927078883 implements MigrationInterface {
    name = 'ClientInvoiceChanges1789927078883'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_invoices" ADD "submissionDate" date`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ADD "receivedDate" date`);
        await queryRunner.query(`ALTER TYPE "public"."client_invoices_invoicestatus_enum" RENAME TO "client_invoices_invoicestatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."client_invoices_invoicestatus_enum" AS ENUM('pending', 'submitted', 'received', 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" TYPE "public"."client_invoices_invoicestatus_enum" USING "invoiceStatus"::"text"::"public"."client_invoices_invoicestatus_enum"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."client_invoices_invoicestatus_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."client_invoices_invoicestatus_enum_old" AS ENUM('pending', 'paid', 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" TYPE "public"."client_invoices_invoicestatus_enum_old" USING "invoiceStatus"::"text"::"public"."client_invoices_invoicestatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ALTER COLUMN "invoiceStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."client_invoices_invoicestatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."client_invoices_invoicestatus_enum_old" RENAME TO "client_invoices_invoicestatus_enum"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" DROP COLUMN "receivedDate"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" DROP COLUMN "submissionDate"`);
    }

}
