import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace bilty_freights.paymentAmount with amount breakdown:
 * detentionAmount, stopCommissionAmount, othersAmount, totalAmount.
 * Keeps remarks + proofImages.
 */
export class BiltyFreightAmountBreakdown1791040000001
  implements MigrationInterface
{
  name = 'BiltyFreightAmountBreakdown1791040000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "detentionAmount" numeric(20,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "stopCommissionAmount" numeric(20,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "othersAmount" numeric(20,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "totalAmount" numeric(20,2) NOT NULL DEFAULT 0
    `);

    // Backfill total from legacy paymentAmount when present
    const hasPayment = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'bilty_freights'
        AND column_name = 'paymentAmount'
      LIMIT 1
    `);
    if (hasPayment?.length) {
      await queryRunner.query(`
        UPDATE "bilty_freights"
        SET "totalAmount" = COALESCE("paymentAmount", 0)
        WHERE COALESCE("totalAmount", 0) = 0
          AND COALESCE("paymentAmount", 0) <> 0
      `);
      await queryRunner.query(`
        ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "paymentAmount"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "paymentAmount" numeric(20,2)
    `);
    await queryRunner.query(`
      UPDATE "bilty_freights"
      SET "paymentAmount" = COALESCE("totalAmount", 0)
      WHERE "paymentAmount" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ALTER COLUMN "paymentAmount" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "totalAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "othersAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "stopCommissionAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "detentionAmount"
    `);
  }
}
