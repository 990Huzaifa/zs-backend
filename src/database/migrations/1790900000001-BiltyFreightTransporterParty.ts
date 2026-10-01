import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bilty freights can settle against broker OR transporter.
 * Adds partyType + transporterId; brokerId becomes nullable.
 */
export class BiltyFreightTransporterParty1790900000001
  implements MigrationInterface
{
  name = 'BiltyFreightTransporterParty1790900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."bilty_freights_partytype_enum" AS ENUM('BROKER', 'TRANSPORTER');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "partyType" "public"."bilty_freights_partytype_enum"
    `);

    await queryRunner.query(`
      UPDATE "bilty_freights"
      SET "partyType" = 'BROKER'
      WHERE "partyType" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ALTER COLUMN "partyType" SET DEFAULT 'BROKER'
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ALTER COLUMN "partyType" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD COLUMN IF NOT EXISTS "transporterId" uuid
    `);

    // Drop NOT NULL on brokerId (existing FK name may vary after MM migration)
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ALTER COLUMN "brokerId" DROP NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bilty_freights"
          ADD CONSTRAINT "FK_bilty_freights_transporterId"
          FOREIGN KEY ("transporterId") REFERENCES "transporters"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bilty_freights_transporterId"
        ON "bilty_freights" ("transporterId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bilty_freights_partyType"
        ON "bilty_freights" ("partyType")
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."transactions_referencetype_enum"
        ADD VALUE IF NOT EXISTS 'BILTY_FREIGHT_TRANSPORTER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_bilty_freights_partyType"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_bilty_freights_transporterId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        DROP CONSTRAINT IF EXISTS "FK_bilty_freights_transporterId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "transporterId"
    `);

    // Cannot safely re-add NOT NULL if transporter rows exist
    await queryRunner.query(`
      DELETE FROM "bilty_freights" WHERE "brokerId" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights" ALTER COLUMN "brokerId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty_freights" DROP COLUMN IF EXISTS "partyType"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bilty_freights_partytype_enum"`,
    );
    // Enum value BILTY_FREIGHT_TRANSPORTER cannot be removed from PG easily — leave it.
  }
}
