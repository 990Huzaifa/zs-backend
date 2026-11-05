import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * vendor_invoices.proofImages (jsonb) — optional proof image keys/URLs.
 */
export class VendorInvoiceProofImages1791440000001
  implements MigrationInterface
{
  name = 'VendorInvoiceProofImages1791440000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_invoices"
        ADD COLUMN IF NOT EXISTS "proofImages" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_invoices"
        DROP COLUMN IF EXISTS "proofImages"
    `);
  }
}
