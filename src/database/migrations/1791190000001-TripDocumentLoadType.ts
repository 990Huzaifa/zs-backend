import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * trip_documents.loadType (UPCOUNTRY | DOWNCOUNTRY) + loadId
 * — optional link from a document to a trip UC/DC load.
 */
export class TripDocumentLoadType1791190000001 implements MigrationInterface {
  name = 'TripDocumentLoadType1791190000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."trip_documents_loadtype_enum"
          AS ENUM('UPCOUNTRY', 'DOWNCOUNTRY');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_documents"
        ADD COLUMN IF NOT EXISTS "loadType"
        "public"."trip_documents_loadtype_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_documents"
        ADD COLUMN IF NOT EXISTS "loadId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trip_documents"
        DROP COLUMN IF EXISTS "loadId"
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_documents"
        DROP COLUMN IF EXISTS "loadType"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."trip_documents_loadtype_enum"
    `);
  }
}
