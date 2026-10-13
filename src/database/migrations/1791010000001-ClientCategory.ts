import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add clients.category enum (COMPANY | TRANSPORTER | BROKER), default COMPANY.
 */
export class ClientCategory1791010000001 implements MigrationInterface {
  name = 'ClientCategory1791010000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."clients_category_enum" AS ENUM(
          'COMPANY', 'TRANSPORTER', 'BROKER'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "clients"
      ADD COLUMN IF NOT EXISTS "category" "public"."clients_category_enum"
      NOT NULL DEFAULT 'COMPANY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clients" DROP COLUMN IF EXISTS "category"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."clients_category_enum"
    `);
  }
}
