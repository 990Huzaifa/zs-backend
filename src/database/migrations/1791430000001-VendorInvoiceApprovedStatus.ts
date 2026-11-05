import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add APPROVED to vendor_invoices.status
 * (LEDGER_ONLY summary posts on approve, not create).
 */
export class VendorInvoiceApprovedStatus1791430000001
  implements MigrationInterface
{
  name = 'VendorInvoiceApprovedStatus1791430000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."vendor_invoices_status_enum"
        ADD VALUE IF NOT EXISTS 'APPROVED'
    `);
  }

  public async down(): Promise<void> {
    // PG cannot easily remove enum values
  }
}
