import { MigrationInterface, QueryRunner } from "typeorm";

export class MajorConnection1789592765455 implements MigrationInterface {
    name = 'MajorConnection1789592765455'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."client_invoices_invoicestatus_enum" AS ENUM('pending', 'paid', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "client_invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "invoiceNumber" character varying(255) NOT NULL, "invoiceDate" date NOT NULL, "invoiceStatus" "public"."client_invoices_invoicestatus_enum" NOT NULL DEFAULT 'pending', "freightAmount" numeric(10,2) NOT NULL, "salesTaxAmount" numeric(10,2) NOT NULL, "withHoldingTaxAmount" numeric(10,2) NOT NULL, "netAmount" numeric(10,2) NOT NULL, "note" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_719cf562e8be7c5974948deab60" UNIQUE ("invoiceNumber"), CONSTRAINT "PK_e710ecb019ac03ca2d3f3905024" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "client_invoice_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "invoiceId" uuid NOT NULL, "tripId" uuid NOT NULL, "freightAmount" numeric(10,2) NOT NULL, "saleTaxRuleId" uuid NOT NULL, "saleTaxRate" numeric(10,2) NOT NULL, "salesTaxAmount" numeric(10,2) NOT NULL, "withholdingTaxRuleId" uuid NOT NULL, "withholdingTaxRate" numeric(10,2) NOT NULL, "withholdingTaxAmount" numeric(10,2) NOT NULL, "netAmount" numeric(10,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7241cf2c664fcadbe031f2197f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tax_rules" ADD "withHeldtaxRate" jsonb`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD "estimatedHours" integer`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" ADD "voucherNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" ADD CONSTRAINT "UQ_8cfa9ff5a00f59a70e9be431bee" UNIQUE ("voucherNumber")`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" ADD "lable" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "voucherNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD CONSTRAINT "UQ_41d04407e1527f42028a7774c54" UNIQUE ("voucherNumber")`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "vendorProductId" uuid`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "rate" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "quantity" numeric(12,3) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "cashAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "totalAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD "lable" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" ADD "voucherNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" ADD CONSTRAINT "UQ_dfc5245b39ebd49daccb4c0fb89" UNIQUE ("voucherNumber")`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" ADD "voucherNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" ADD CONSTRAINT "UQ_32063b9e36312ce38822ac7f4b7" UNIQUE ("voucherNumber")`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "withHeldtaxRate" jsonb`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ALTER COLUMN "amount" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ADD CONSTRAINT "FK_0f4e177361bb93950e6bbd703f9" FOREIGN KEY ("vendorProductId") REFERENCES "vendor_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_invoices" ADD CONSTRAINT "FK_14199addc3d76982155a97022a3" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD CONSTRAINT "FK_d98f9dc057222075482975ba5d0" FOREIGN KEY ("invoiceId") REFERENCES "client_invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD CONSTRAINT "FK_215b46d3a36a28caa8c52308ec7" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD CONSTRAINT "FK_302e83303f5268908756a7fd757" FOREIGN KEY ("saleTaxRuleId") REFERENCES "tax_rules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" ADD CONSTRAINT "FK_cd5cb27c88abdd05df93a3f57b5" FOREIGN KEY ("withholdingTaxRuleId") REFERENCES "tax_rules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP CONSTRAINT "FK_cd5cb27c88abdd05df93a3f57b5"`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP CONSTRAINT "FK_302e83303f5268908756a7fd757"`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP CONSTRAINT "FK_215b46d3a36a28caa8c52308ec7"`);
        await queryRunner.query(`ALTER TABLE "client_invoice_items" DROP CONSTRAINT "FK_d98f9dc057222075482975ba5d0"`);
        await queryRunner.query(`ALTER TABLE "client_invoices" DROP CONSTRAINT "FK_14199addc3d76982155a97022a3"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP CONSTRAINT "FK_0f4e177361bb93950e6bbd703f9"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" ALTER COLUMN "amount" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "withHeldtaxRate"`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" DROP CONSTRAINT "UQ_32063b9e36312ce38822ac7f4b7"`);
        await queryRunner.query(`ALTER TABLE "trip_other_expenses" DROP COLUMN "voucherNumber"`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" DROP CONSTRAINT "UQ_dfc5245b39ebd49daccb4c0fb89"`);
        await queryRunner.query(`ALTER TABLE "trip_mtag_expenses" DROP COLUMN "voucherNumber"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "lable"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "totalAmount"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "cashAmount"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "rate"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "vendorProductId"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP CONSTRAINT "UQ_41d04407e1527f42028a7774c54"`);
        await queryRunner.query(`ALTER TABLE "trip_pump_expenses" DROP COLUMN "voucherNumber"`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" DROP COLUMN "lable"`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" DROP CONSTRAINT "UQ_8cfa9ff5a00f59a70e9be431bee"`);
        await queryRunner.query(`ALTER TABLE "trip_office_expenses" DROP COLUMN "voucherNumber"`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP COLUMN "estimatedHours"`);
        await queryRunner.query(`ALTER TABLE "tax_rules" DROP COLUMN "withHeldtaxRate"`);
        await queryRunner.query(`DROP TABLE "client_invoice_items"`);
        await queryRunner.query(`DROP TABLE "client_invoices"`);
        await queryRunner.query(`DROP TYPE "public"."client_invoices_invoicestatus_enum"`);
    }

}
