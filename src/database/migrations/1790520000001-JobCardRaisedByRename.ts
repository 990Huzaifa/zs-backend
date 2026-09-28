import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename job_cards.reportedById → raisedById.
 * Drop unused reportedAt (no raisedAt column).
 */
export class JobCardRaisedByRename1790520000001
  implements MigrationInterface
{
  name = 'JobCardRaisedByRename1790520000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_cards" RENAME COLUMN "reportedById" TO "raisedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP COLUMN "reportedAt"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD "reportedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" RENAME COLUMN "raisedById" TO "reportedById"`,
    );
  }
}
