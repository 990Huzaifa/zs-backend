import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientVoucherChanges1789897837211 implements MigrationInterface {
    name = 'ClientVoucherChanges1789897837211'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_93e0eac253ebefa20cc390e18ff"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" RENAME COLUMN "clientAccId" TO "clientInvoiceId"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ALTER COLUMN "clientInvoiceId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_7a7a0e55f41fe158aad728bd3cb" FOREIGN KEY ("clientInvoiceId") REFERENCES "client_invoices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_vouchers" DROP CONSTRAINT "FK_7a7a0e55f41fe158aad728bd3cb"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ALTER COLUMN "clientInvoiceId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" RENAME COLUMN "clientInvoiceId" TO "clientAccId"`);
        await queryRunner.query(`ALTER TABLE "client_vouchers" ADD CONSTRAINT "FK_93e0eac253ebefa20cc390e18ff" FOREIGN KEY ("clientAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
