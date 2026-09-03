import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientWithHoldingTaxTypes1788454887280 implements MigrationInterface {
    name = 'ClientWithHoldingTaxTypes1788454887280'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "client_with_holding_tax_types" ("clientId" uuid NOT NULL, "taxRuleId" uuid NOT NULL, CONSTRAINT "PK_6454e75ffd31d684bb0e1582d82" PRIMARY KEY ("clientId", "taxRuleId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c9b2f0c637add8e0903afcba10" ON "client_with_holding_tax_types" ("clientId") `);
        await queryRunner.query(`CREATE INDEX "IDX_06d9c4a6030ab224233e9fb3cb" ON "client_with_holding_tax_types" ("taxRuleId") `);
        await queryRunner.query(`ALTER TABLE "client_with_holding_tax_types" ADD CONSTRAINT "FK_c9b2f0c637add8e0903afcba107" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "client_with_holding_tax_types" ADD CONSTRAINT "FK_06d9c4a6030ab224233e9fb3cb0" FOREIGN KEY ("taxRuleId") REFERENCES "tax_rules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_with_holding_tax_types" DROP CONSTRAINT "FK_06d9c4a6030ab224233e9fb3cb0"`);
        await queryRunner.query(`ALTER TABLE "client_with_holding_tax_types" DROP CONSTRAINT "FK_c9b2f0c637add8e0903afcba107"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06d9c4a6030ab224233e9fb3cb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c9b2f0c637add8e0903afcba10"`);
        await queryRunner.query(`DROP TABLE "client_with_holding_tax_types"`);
    }

}
