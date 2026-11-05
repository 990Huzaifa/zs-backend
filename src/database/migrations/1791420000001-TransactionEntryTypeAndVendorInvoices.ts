import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - transactions.entryType (ACCOUNTING | LEDGER_ONLY)
 * - transactions.showInLedger
 * - referenceType: VENDOR_INVOICE_SUMMARY
 * - vendor_invoices + vendor_invoice_items
 */
export class TransactionEntryTypeAndVendorInvoices1791420000001
  implements MigrationInterface
{
  name = 'TransactionEntryTypeAndVendorInvoices1791420000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."transactions_entrytype_enum" AS ENUM(
          'ACCOUNTING',
          'LEDGER_ONLY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "entryType" "public"."transactions_entrytype_enum"
        NOT NULL DEFAULT 'ACCOUNTING'
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "showInLedger" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."transactions_referencetype_enum"
        ADD VALUE IF NOT EXISTS 'VENDOR_INVOICE_SUMMARY'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_entryType"
        ON "transactions" ("entryType")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_showInLedger"
        ON "transactions" ("showInLedger")
      WHERE "showInLedger" = true
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."vendor_invoices_status_enum" AS ENUM(
          'PENDING',
          'PAID',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendorId" uuid NOT NULL,
        "invoiceNumber" character varying NOT NULL,
        "description" text,
        "invoiceDate" date NOT NULL,
        "totalAmount" numeric(18,2) NOT NULL,
        "remarks" text,
        "status" "public"."vendor_invoices_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_invoices_invoiceNumber" UNIQUE ("invoiceNumber")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_invoices"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoices_vendorId"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_invoices"
        ADD CONSTRAINT "FK_vendor_invoices_vendorId"
        FOREIGN KEY ("vendorId") REFERENCES "vendors"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_invoices_vendorId"
        ON "vendor_invoices" ("vendorId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_invoices_status"
        ON "vendor_invoices" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_invoices_invoiceDate"
        ON "vendor_invoices" ("invoiceDate")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_invoice_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendorInvoiceId" uuid NOT NULL,
        "transactionId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_invoice_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoice_items_vendorInvoiceId"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        ADD CONSTRAINT "FK_vendor_invoice_items_vendorInvoiceId"
        FOREIGN KEY ("vendorInvoiceId") REFERENCES "vendor_invoices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoice_items_transactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        ADD CONSTRAINT "FK_vendor_invoice_items_transactionId"
        FOREIGN KEY ("transactionId") REFERENCES "transactions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_invoice_items_vendorInvoiceId"
        ON "vendor_invoice_items" ("vendorInvoiceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vendor_invoice_items_transactionId"
        ON "vendor_invoice_items" ("transactionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vendor_invoice_items_transactionId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vendor_invoice_items_vendorInvoiceId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoice_items_transactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_invoice_items"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoice_items_vendorInvoiceId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_invoice_items"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vendor_invoices_invoiceDate"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vendor_invoices_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vendor_invoices_vendorId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vendor_invoices"
        DROP CONSTRAINT IF EXISTS "FK_vendor_invoices_vendorId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_invoices"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."vendor_invoices_status_enum"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_showInLedger"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_entryType"`,
    );
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "showInLedger"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "entryType"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."transactions_entrytype_enum"`,
    );
    // VENDOR_INVOICE_SUMMARY enum value cannot be removed safely in PG
  }
}
