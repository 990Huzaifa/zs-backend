import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - Add ALERTS to system_settings_key_enum
 * - Create alerts table for durable document-expiry (and future) alerts
 */
export class DocumentExpiryAlerts1790990000001 implements MigrationInterface {
  name = 'DocumentExpiryAlerts1790990000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" ADD VALUE IF NOT EXISTS 'ALERTS'`,
    );

    await queryRunner.query(`
      CREATE TYPE "public"."alerts_severity_enum" AS ENUM('info', 'success', 'warning', 'critical')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."alerts_status_enum" AS ENUM('open', 'acknowledged', 'resolved', 'dismissed')
    `);

    await queryRunner.query(`
      CREATE TABLE "alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying(100) NOT NULL,
        "module" character varying(100) NOT NULL,
        "severity" "public"."alerts_severity_enum" NOT NULL DEFAULT 'warning',
        "status" "public"."alerts_status_enum" NOT NULL DEFAULT 'open',
        "title" character varying(255) NOT NULL,
        "message" text NOT NULL,
        "entityType" character varying(100),
        "entityId" uuid,
        "dueAt" date NOT NULL,
        "windowStartsAt" date NOT NULL,
        "sourceKey" character varying(255) NOT NULL,
        "metadata" jsonb,
        "resolvedAt" TIMESTAMPTZ,
        "resolvedById" uuid,
        "resolutionNote" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_alerts_sourceKey" UNIQUE ("sourceKey"),
        CONSTRAINT "FK_alerts_resolvedById" FOREIGN KEY ("resolvedById")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_alerts_status" ON "alerts" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_alerts_type" ON "alerts" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_alerts_dueAt" ON "alerts" ("dueAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_alerts_dueAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_alerts_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_alerts_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alerts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."alerts_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."alerts_severity_enum"`,
    );

    await queryRunner.query(
      `DELETE FROM "system_settings" WHERE "key" = 'ALERTS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."system_settings_key_enum" RENAME TO "system_settings_key_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."system_settings_key_enum" AS ENUM('GEO', 'BUSINESS_INFO', 'MAINTENANCE', 'PAYROLL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "system_settings" ALTER COLUMN "key" TYPE "public"."system_settings_key_enum" USING "key"::"text"::"public"."system_settings_key_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."system_settings_key_enum_old"`,
    );
  }
}
