import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Point bilty / bilty_freights brokerId + transporterId at clients
 * (category BROKER / TRANSPORTER). Columns already exist (nullable uuid);
 * FKs to brokers/transporters were dropped in 179102.
 */
export class BiltyBrokerTransporterClientFks1791030000001
  implements MigrationInterface
{
  name = 'BiltyBrokerTransporterClientFks1791030000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Orphan ids (should already be null after 179102) — clear anything not in clients
    await queryRunner.query(`
      UPDATE "bilty" b
      SET "brokerId" = NULL
      WHERE "brokerId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c.id = b."brokerId")
    `);
    await queryRunner.query(`
      UPDATE "bilty" b
      SET "transporterId" = NULL
      WHERE "transporterId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c.id = b."transporterId")
    `);
    await queryRunner.query(`
      UPDATE "bilty_freights" f
      SET "brokerId" = NULL
      WHERE "brokerId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c.id = f."brokerId")
    `);
    await queryRunner.query(`
      UPDATE "bilty_freights" f
      SET "transporterId" = NULL
      WHERE "transporterId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "clients" c WHERE c.id = f."transporterId")
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_brokerId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_transporterId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        DROP CONSTRAINT IF EXISTS "FK_bilty_freights_brokerId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        DROP CONSTRAINT IF EXISTS "FK_bilty_freights_transporterId_clients"
    `);

    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD CONSTRAINT "FK_bilty_brokerId_clients"
        FOREIGN KEY ("brokerId") REFERENCES "clients"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        ADD CONSTRAINT "FK_bilty_transporterId_clients"
        FOREIGN KEY ("transporterId") REFERENCES "clients"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD CONSTRAINT "FK_bilty_freights_brokerId_clients"
        FOREIGN KEY ("brokerId") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        ADD CONSTRAINT "FK_bilty_freights_transporterId_clients"
        FOREIGN KEY ("transporterId") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        DROP CONSTRAINT IF EXISTS "FK_bilty_freights_transporterId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty_freights"
        DROP CONSTRAINT IF EXISTS "FK_bilty_freights_brokerId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_transporterId_clients"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty"
        DROP CONSTRAINT IF EXISTS "FK_bilty_brokerId_clients"
    `);
  }
}
