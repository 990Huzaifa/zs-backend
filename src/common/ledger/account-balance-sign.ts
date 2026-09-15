/**
 * Debit-normal: Assets (1), Expenses (5) → balance += debit − credit
 * Credit-normal: Liabilities (2), Equity (3), Revenue (4) → balance += credit − debit
 */
export function isCreditNormalAccount(level1: number): boolean {
  return level1 === 2 || level1 === 3 || level1 === 4;
}

export function applyLedgerBalanceDelta(
  previousBalance: number,
  debit: number,
  credit: number,
  level1: number,
): number {
  const next = isCreditNormalAccount(level1)
    ? previousBalance + credit - debit
    : previousBalance + debit - credit;
  return Math.round(next * 100) / 100;
}
