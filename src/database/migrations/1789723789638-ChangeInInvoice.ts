import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeInInvoice1789723789638 implements MigrationInterface {
    name = 'ChangeInInvoice1789723789638'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_invoices" ADD "saleTaxWithheldAmount" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD "saleTaxWithheldPercent" numeric(8,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD "saleTaxWithheldAmount" numeric(10,2) NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP COLUMN "saleTaxWithheldAmount"`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP COLUMN "saleTaxWithheldPercent"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" DROP COLUMN "saleTaxWithheldAmount"`);
    }

}
