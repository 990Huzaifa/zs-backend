import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - Rename bilty_loadings.loadingDate → departureDateTime (date → timestamp, data kept).
 * - Add optional bilty.remarks.
 */
export class BiltyLoadingDepartureDateTime1790940000001
  implements MigrationInterface
{
  name = 'BiltyLoadingDepartureDateTime1790940000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty_loadings" RENAME COLUMN "loadingDate" TO "departureDateTime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_loadings" ALTER COLUMN "departureDateTime" TYPE TIMESTAMP USING "departureDateTime"::timestamp`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" ADD "remarks" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bilty" DROP COLUMN "remarks"`);
    await queryRunner.query(
      `ALTER TABLE "bilty_loadings" ALTER COLUMN "departureDateTime" TYPE date USING "departureDateTime"::date`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_loadings" RENAME COLUMN "departureDateTime" TO "loadingDate"`,
    );
  }
}
