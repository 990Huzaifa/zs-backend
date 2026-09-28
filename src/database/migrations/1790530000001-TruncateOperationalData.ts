import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wipe operational data. Preserve default / seed masters:
 * - users, permissions, roles, rolePermissions
 * - countries, states, cities
 * - system_settings
 * - banks (seeded)
 * - chart_of_accounts (SYSTEM rows only)
 * - migrations (TypeORM)
 *
 * Non-SYSTEM COA (party / business / employee leaves) are deleted after truncate.
 */
export class TruncateOperationalData1790530000001
  implements MigrationInterface
{
  name = 'TruncateOperationalData1790530000001';

  private readonly keepTables = new Set([
    'migrations',
    'typeorm_metadata',
    'users',
    'permissions',
    'roles',
    'rolePermissions',
    'countries',
    'states',
    'cities',
    'system_settings',
    'banks',
    'chart_of_accounts',
  ]);

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ tablename: string }> = await queryRunner.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const toTruncate = rows
      .map((r) => r.tablename)
      .filter((name) => !this.keepTables.has(name));

    if (toTruncate.length) {
      const list = toTruncate.map((t) => `"${t}"`).join(', ');
      await queryRunner.query(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
      );
    }

    // Keep seeded SYSTEM chart only; drop runtime party/business leaves.
    await queryRunner.query(`
      DELETE FROM "chart_of_accounts"
      WHERE "accountKind" <> 'SYSTEM'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible data wipe — no restore.
  }
}
