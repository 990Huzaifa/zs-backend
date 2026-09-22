import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1789944000001 implements MigrationInterface {
  name = 'Notifications1789944000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_severity_enum" AS ENUM('info', 'success', 'warning', 'critical')`,
    );
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying(100) NOT NULL,
        "module" character varying(100) NOT NULL,
        "severity" "public"."notifications_severity_enum" NOT NULL DEFAULT 'info',
        "title" character varying(255) NOT NULL,
        "message" text NOT NULL,
        "entityType" character varying(100),
        "entityId" uuid,
        "actionUrl" character varying(500),
        "metadata" jsonb,
        "groupKey" character varying(255),
        "eventKey" character varying(255) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notifications_eventKey" UNIQUE ("eventKey")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_groupKey" ON "notifications" ("groupKey")`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "notificationId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "dismissedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_recipients_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_recipients_notification_user" UNIQUE ("notificationId", "userId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipients_user_read" ON "notification_recipients" ("userId", "readAt")`,
    );
    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
      ADD CONSTRAINT "FK_notification_recipients_notificationId"
      FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
      ADD CONSTRAINT "FK_notification_recipients_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_notification_recipients_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_notification_recipients_notificationId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_recipients_user_read"`,
    );
    await queryRunner.query(`DROP TABLE "notification_recipients"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_groupKey"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP TYPE "public"."notifications_severity_enum"`,
    );
  }
}
