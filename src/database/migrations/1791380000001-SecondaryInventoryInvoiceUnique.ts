import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * secondary_inventory.InvoiceNo must be unique (form live-check + create).
 */
export class SecondaryInventoryInvoiceUnique1791380000001
  implements MigrationInterface
{
  name = 'SecondaryInventoryInvoiceUnique1791380000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_secondary_inventory_InvoiceNo"
        ON "secondary_inventory" ("InvoiceNo")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_secondary_inventory_InvoiceNo"
    `);
  }
}
