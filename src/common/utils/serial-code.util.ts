import { ObjectLiteral, Repository } from 'typeorm';

/** Default zero-pad width: USER000001, ZS000001 */
export const SERIAL_CODE_PAD = 6;

export const USER_CODE_PREFIX = 'USER';
export const BILTY_CODE_PREFIX = 'ZS';

/**
 * Next serial code for a varchar `code` column, e.g. USER000001 / ZS000002.
 * Looks at existing rows matching `^PREFIX\d+$` and increments the max number.
 * Pure app-side logic (no DB sequence).
 *
 * @param skip Extra increment for concurrent retry (0 = normal next).
 */
export async function nextSerialCode<T extends ObjectLiteral>(
  repo: Repository<T>,
  prefix: string,
  codeColumn: keyof T & string = 'code' as keyof T & string,
  pad: number = SERIAL_CODE_PAD,
  skip: number = 0,
): Promise<string> {
  const alias = 'row';
  const col = `${alias}.${codeColumn}`;
  const pattern = `^${escapeRegex(prefix)}[0-9]+$`;

  const raw = await repo
    .createQueryBuilder(alias)
    .select(col, 'code')
    .where(`${col} ~ :pattern`, { pattern })
    .orderBy(`LENGTH(${col})`, 'DESC')
    .addOrderBy(col, 'DESC')
    .limit(1)
    .getRawOne<{ code?: string }>();

  let next = 1 + skip;
  if (raw?.code?.startsWith(prefix)) {
    const n = Number.parseInt(raw.code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n >= 0) {
      next = n + 1 + skip;
    }
  }

  return `${prefix}${String(next).padStart(pad, '0')}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
