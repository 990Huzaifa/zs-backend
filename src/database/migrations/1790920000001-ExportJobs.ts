import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExportJobs1790920000001 implements MigrationInterface {
  name = 'ExportJobs1790920000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."export_jobs_entitytype_enum" AS ENUM('DRIVER', 'VEHICLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."export_jobs_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."export_jobs_format_enum" AS ENUM('pdf', 'xlsx')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."export_jobs_mode_enum" AS ENUM('LIST', 'DETAIL_PAGES', 'DOCUMENTS')`,
    );
    await queryRunner.query(`
      CREATE TABLE "export_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entityType" "public"."export_jobs_entitytype_enum" NOT NULL,
        "status" "public"."export_jobs_status_enum" NOT NULL DEFAULT 'QUEUED',
        "format" "public"."export_jobs_format_enum" NOT NULL,
        "mode" "public"."export_jobs_mode_enum" NOT NULL,
        "recordIds" uuid[],
        "filters" jsonb,
        "recordCount" integer NOT NULL DEFAULT 0,
        "fileName" character varying,
        "storageKey" character varying,
        "errorMessage" text,
        "createdById" uuid NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_export_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_export_jobs_createdBy" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_export_jobs_entityType" ON "export_jobs" ("entityType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_export_jobs_createdById" ON "export_jobs" ("createdById")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_export_jobs_status" ON "export_jobs" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_export_jobs_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_export_jobs_createdById"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_export_jobs_entityType"`);
    await queryRunner.query(`DROP TABLE "export_jobs"`);
    await queryRunner.query(`DROP TYPE "public"."export_jobs_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."export_jobs_format_enum"`);
    await queryRunner.query(`DROP TYPE "public"."export_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."export_jobs_entitytype_enum"`);
  }
}
