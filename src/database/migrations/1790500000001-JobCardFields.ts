import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Job card: raiseDate, effectiveDate, siteLocation.
 * Findings: assignedBy, images/attachments, completedAt, odometer, notes,
 * workshopLocation; status enum → pending | in_progress | open | completed | cancelled.
 */
export class JobCardFields1790500000001 implements MigrationInterface {
  name = 'JobCardFields1790500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── job_cards ─────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD "raiseDate" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD "effectiveDate" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD "siteLocation" character varying(255)`,
    );

    // ── job_card_items columns ────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "assignedById" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "findingImage" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "odometerReading" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "attachment" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "note" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "remarks" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD "workshopLocation" character varying(255)`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_card_items" RENAME COLUMN "resolvedAt" TO "completedAt"`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_card_items" ADD CONSTRAINT "FK_job_card_items_assignedById" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ── finding status enum remap ─────────────────────────
    // old: open | in_progress | resolved | deferred | cancelled
    // new: pending | in_progress | open | completed | cancelled
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" TYPE character varying`,
    );
    await queryRunner.query(
      `UPDATE "job_card_items" SET "status" = 'completed' WHERE "status" = 'resolved'`,
    );
    await queryRunner.query(
      `UPDATE "job_card_items" SET "status" = 'pending' WHERE "status" = 'deferred'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."job_card_items_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_card_items_status_enum_new" AS ENUM('pending', 'in_progress', 'open', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" TYPE "public"."job_card_items_status_enum_new" USING "status"::"public"."job_card_items_status_enum_new"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."job_card_items_status_enum_new" RENAME TO "job_card_items_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── finding status enum restore ───────────────────────
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" TYPE character varying`,
    );
    await queryRunner.query(
      `UPDATE "job_card_items" SET "status" = 'resolved' WHERE "status" = 'completed'`,
    );
    await queryRunner.query(
      `UPDATE "job_card_items" SET "status" = 'deferred' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."job_card_items_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_card_items_status_enum_old" AS ENUM('open', 'in_progress', 'resolved', 'deferred', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" TYPE "public"."job_card_items_status_enum_old" USING "status"::"public"."job_card_items_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."job_card_items_status_enum_old" RENAME TO "job_card_items_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" ALTER COLUMN "status" SET DEFAULT 'open'`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP CONSTRAINT "FK_job_card_items_assignedById"`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_card_items" RENAME COLUMN "completedAt" TO "resolvedAt"`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "workshopLocation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "remarks"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "note"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "attachment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "odometerReading"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "findingImage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_card_items" DROP COLUMN "assignedById"`,
    );

    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP COLUMN "siteLocation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP COLUMN "effectiveDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP COLUMN "raiseDate"`,
    );
  }
}
