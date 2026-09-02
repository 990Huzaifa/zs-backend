import { MigrationInterface, QueryRunner } from "typeorm";

export class TaxRuleChanges1788344728835 implements MigrationInterface {
    name = 'TaxRuleChanges1788344728835'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tax_rules" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TYPE "public"."tax_rules_type_enum" RENAME TO "tax_rules_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tax_rules_type_enum" AS ENUM('SALES_TAX', 'SERVICE_TAX', 'WITH_HOLDING_TAX', 'OTHER_TAX')`);
        await queryRunner.query(`ALTER TABLE "tax_rules" ALTER COLUMN "type" TYPE "public"."tax_rules_type_enum" USING "type"::"text"::"public"."tax_rules_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tax_rules_type_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tax_rules_type_enum_old" AS ENUM('SALES_TAX', 'SERVICE_TAX', 'OTHER_TAX')`);
        await queryRunner.query(`ALTER TABLE "tax_rules" ALTER COLUMN "type" TYPE "public"."tax_rules_type_enum_old" USING "type"::"text"::"public"."tax_rules_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."tax_rules_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tax_rules_type_enum_old" RENAME TO "tax_rules_type_enum"`);
        await queryRunner.query(`ALTER TABLE "tax_rules" ADD "name" character varying NOT NULL`);
    }

}
