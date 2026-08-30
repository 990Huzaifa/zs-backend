import { MigrationInterface, QueryRunner } from "typeorm";

export class Transaction1788125752909 implements MigrationInterface {
    name = 'Transaction1788125752909'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."transactions_referencetype_enum" AS ENUM('OPENING_BALANCE', 'TRIP_OFFICE_EXPENSE', 'TRIP_PUMP_EXPENSE', 'TRIP_FUEL_EXPENSE', 'TRIP_MTAG_EXPENSE', 'TRIP_OTHER_EXPENSE')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "chartOfAccountId" uuid NOT NULL, "referenceType" "public"."transactions_referencetype_enum" NOT NULL, "referenceId" uuid, "transactionDate" date NOT NULL, "description" text, "debitAmount" numeric(18,2), "creditAmount" numeric(18,2), "currentBalance" numeric(18,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f3283afa42fb9118b3e8b85c80" ON "transactions" ("chartOfAccountId", "transactionDate", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_faee6acb874b9da3117c3ad313" ON "transactions" ("referenceType", "referenceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_fc106a89717d0b86bdfd3eb9c8" ON "transactions" ("chartOfAccountId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_37adc61669d5b9414e2495398a" ON "transactions" ("chartOfAccountId") `);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_37adc61669d5b9414e2495398a9" FOREIGN KEY ("chartOfAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_37adc61669d5b9414e2495398a9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_37adc61669d5b9414e2495398a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fc106a89717d0b86bdfd3eb9c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_faee6acb874b9da3117c3ad313"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f3283afa42fb9118b3e8b85c80"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_referencetype_enum"`);
    }

}
