import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retire brokers & transporters marketplace parties:
 * - Null bilty / bilty_freight FKs
 * - Delete party COA leaves (+ their ledger lines) under broker/transporter parents
 * - Delete broker login users
 * - Drop broker/transporter tables (+ cascades contacts/docs)
 * - Drop FKs; keep nullable uuid columns on bilty / bilty_freights for later client remap
 */
export class RemoveBrokersAndTransporters1791020000001
  implements MigrationInterface
{
  name = 'RemoveBrokersAndTransporters1791020000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Detach bilty headers ──────────────────────────────────────────
    await queryRunner.query(`
      UPDATE "bilty" SET "brokerId" = NULL WHERE "brokerId" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "bilty" SET "transporterId" = NULL WHERE "transporterId" IS NOT NULL
    `);

    // ── Detach freight party FKs (historical vouchers keep partyType) ─
    await queryRunner.query(`
      UPDATE "bilty_freights" SET "brokerId" = NULL WHERE "brokerId" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "bilty_freights" SET "transporterId" = NULL WHERE "transporterId" IS NOT NULL
    `);

    // ── Alerts for broker/transporter docs ────────────────────────────
    await queryRunner.query(`
      DELETE FROM "alerts"
      WHERE "module" IN ('BROKER', 'TRANSPORTER')
         OR "entityType" IN ('BROKER_DOCUMENT', 'TRANSPORTER_DOCUMENT')
    `);

    // ── Party COA leaves + ledger under broker/transporter parents ────
    const parents = `('1-1-3-4','1-1-3-5','2-1-1-2','2-1-1-4')`;
    await queryRunner.query(`
      DELETE FROM "transactions"
      WHERE "chartOfAccountId" IN (
        SELECT "id" FROM "chart_of_accounts"
        WHERE "parentCode" IN ${parents}
          AND "isPostable" = true
      )
    `);
    await queryRunner.query(`
      DELETE FROM "chart_of_accounts"
      WHERE "parentCode" IN ${parents}
        AND "isPostable" = true
    `);

    // ── Collect broker user ids before dropping brokers ───────────────
    await queryRunner.query(`
      CREATE TEMP TABLE "_broker_user_ids" AS
      SELECT DISTINCT "userId" AS id
      FROM "brokers"
      WHERE "userId" IS NOT NULL
    `);

    // Detach RESTRICT audit FKs so broker users can be deleted
    const auditTables: Array<{ table: string; column: string }> = [
      { table: 'client_vouchers', column: 'createdBy' },
      { table: 'vendor_vouchers', column: 'createdBy' },
      { table: 'expense_vouchers', column: 'createdBy' },
      { table: 'contra_vouchers', column: 'createdBy' },
      { table: 'salary_vouchers', column: 'createdBy' },
      { table: 'maintenance_vouchers', column: 'createdBy' },
      { table: 'bilty_freights', column: 'createdBy' },
      { table: 'client_invoices', column: 'createdBy' },
      { table: 'purchase_orders', column: 'createdBy' },
      { table: 'purchase_quotations', column: 'createdBy' },
      { table: 'goods_receipt_notes', column: 'createdBy' },
      { table: 'job_cards', column: 'createdBy' },
      { table: 'maintenance_stock_issues', column: 'createdBy' },
      { table: 'activities', column: 'actorUserId' },
      { table: 'export_jobs', column: 'requestedById' },
      { table: 'alerts', column: 'resolvedById' },
      { table: 'bilty', column: 'createdById' },
    ];

    for (const { table, column } of auditTables) {
      const exists = await queryRunner.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '${table}'
        LIMIT 1
      `);
      if (!exists?.length) continue;
      const colExists = await queryRunner.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '${table}'
          AND column_name = '${column}'
        LIMIT 1
      `);
      if (!colExists?.length) continue;
      await queryRunner.query(`
        UPDATE "${table}" t
        SET "${column}" = NULL
        WHERE "${column}" IN (SELECT id FROM "_broker_user_ids")
      `);
    }

    await queryRunner.query(`
      DELETE FROM "notification_recipients"
      WHERE "userId" IN (SELECT id FROM "_broker_user_ids")
    `);

    // ── Drop FKs that reference brokers / transporters ────────────────
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP CONSTRAINT IF EXISTS "FK_bilty_brokerId"
    `);
    await queryRunner.query(`
      ALTER TABLE "bilty" DROP CONSTRAINT IF EXISTS "FK_3a0d0f5c0b1b_broker"
    `);
    // TypeORM-generated names from older migrations — discover & drop
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT con.conname, rel.relname AS tbl
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_class ref ON ref.oid = con.confrelid
          WHERE con.contype = 'f'
            AND ref.relname IN ('brokers', 'transporters')
        LOOP
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
        END LOOP;
      END $$;
    `);

    // ── Drop party tables (contacts/docs CASCADE via FK already dropped) ─
    await queryRunner.query(`DROP TABLE IF EXISTS "broker_documents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broker_contacts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "brokers" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transporter_documents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transporter_contacts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transporters" CASCADE`);

    // ── Delete broker profile users ───────────────────────────────────
    await queryRunner.query(`
      DELETE FROM "users"
      WHERE id IN (SELECT id FROM "_broker_user_ids")
         OR "profileType" = 'BROKER'
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "_broker_user_ids"`);

    // ── Drop status enums ─────────────────────────────────────────────
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."brokers_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."transporters_status_enum"`,
    );
  }

  public async down(): Promise<void> {
    // Irreversible data wipe — recreate tables via older migrations if needed.
    throw new Error(
      'RemoveBrokersAndTransporters1791020000001 cannot be reverted',
    );
  }
}
