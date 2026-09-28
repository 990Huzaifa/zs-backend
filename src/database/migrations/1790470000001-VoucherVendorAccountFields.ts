import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add nullable vendor bank account fields on vendor + maintenance vouchers.
 */
export class VoucherVendorAccountFields1790470000001
  implements MigrationInterface
{
  name = 'VoucherVendorAccountFields1790470000001';

  private readonly tables = ['vendor_vouchers', 'maintenance_vouchers'] as const;

  private readonly columns = [
    'vendorAccountTitle',
    'vendorAccountNo',
    'vendorBank',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      for (const column of this.columns) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD "${column}" character varying`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...this.tables].reverse()) {
      for (const column of [...this.columns].reverse()) {
        await queryRunner.query(
          `ALTER TABLE "${table}" DROP COLUMN "${column}"`,
        );
      }
    }
  }
}
