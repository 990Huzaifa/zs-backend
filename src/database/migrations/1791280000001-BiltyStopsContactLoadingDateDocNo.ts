import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * bilty_loadings / bilty_off_loadings.stopsContact jsonb shape extended with
 * optional `loadingDate` and `docNo` per stop object.
 * Column type stays jsonb — no ALTER TABLE required.
 */
export class BiltyStopsContactLoadingDateDocNo1791280000001
  implements MigrationInterface
{
  name = 'BiltyStopsContactLoadingDateDocNo1791280000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON COLUMN "bilty_loadings"."stopsContact" IS
        'jsonb array of { name, phone, address, loadingDate?, docNo? }'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "bilty_off_loadings"."stopsContact" IS
        'jsonb array of { name, phone, address, loadingDate?, docNo? }'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON COLUMN "bilty_loadings"."stopsContact" IS NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "bilty_off_loadings"."stopsContact" IS NULL
    `);
  }
}
