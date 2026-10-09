import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional bilty → transportation_products FK.
 */
export class BiltyTransportationProduct1790980000001
  implements MigrationInterface
{
  name = 'BiltyTransportationProduct1790980000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
      ADD "transportationProductId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
      ADD CONSTRAINT "FK_bilty_transportationProductId"
      FOREIGN KEY ("transportationProductId")
      REFERENCES "transportation_products"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty"
      DROP CONSTRAINT IF EXISTS "FK_bilty_transportationProductId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
      DROP COLUMN IF EXISTS "transportationProductId"
    `);
  }
}
