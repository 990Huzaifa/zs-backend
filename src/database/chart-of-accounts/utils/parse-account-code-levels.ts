import { AccountCodeLevels } from '../../entities/chart-of-account.entity';

/** Parse dotted/hyphen account code into level1..level6 (missing → 0). */
export function parseAccountCodeLevels(code: string): AccountCodeLevels {
  const parts = code
    .split('-')
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));

  return {
    level1: parts[0] ?? 0,
    level2: parts[1] ?? 0,
    level3: parts[2] ?? 0,
    level4: parts[3] ?? 0,
    level5: parts[4] ?? 0,
    level6: parts[5] ?? 0,
  };
}
