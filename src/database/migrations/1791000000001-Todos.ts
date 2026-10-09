import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personal sticky-note todos (per-user softboard).
 */
export class Todos1791000000001 implements MigrationInterface {
  name = 'Todos1791000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."todos_status_enum" AS ENUM(
          'pending', 'in_progress', 'done'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "todos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text,
        "status" "public"."todos_status_enum" NOT NULL DEFAULT 'pending',
        "color" character varying(32) NOT NULL DEFAULT '#FEF3C7',
        "sortOrder" integer NOT NULL DEFAULT 0,
        "pinned" boolean NOT NULL DEFAULT false,
        "dueAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_todos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_todos_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_todos_userId_status"
        ON "todos" ("userId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_todos_userId_sortOrder"
        ON "todos" ("userId", "sortOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_todos_userId_sortOrder"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_todos_userId_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "todos"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."todos_status_enum"`);
  }
}
