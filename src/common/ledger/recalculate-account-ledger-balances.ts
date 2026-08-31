import { EntityManager } from 'typeorm';
import { Transaction } from '../../database/entities/transaction.entity';

/**
 * Rebuild running `currentBalance` for every ledger line on one account.
 * Order: transactionDate ASC, then createdAt ASC.
 * Balance rule: previous + debit − credit (same as opening / postEntry).
 */
export async function recalculateAccountLedgerBalances(
  manager: EntityManager,
  chartOfAccountId: string,
): Promise<void> {
  const txRepo = manager.getRepository(Transaction);
  const rows = await txRepo.find({
    where: { chartOfAccountId },
    order: { transactionDate: 'ASC', createdAt: 'ASC' },
  });

  let balance = 0;
  for (const row of rows) {
    const debit = Number(row.debitAmount) || 0;
    const credit = Number(row.creditAmount) || 0;
    balance = Math.round((balance + debit - credit) * 100) / 100;
    row.currentBalance = balance.toFixed(2) as unknown as number;
  }

  if (rows.length) {
    await txRepo.save(rows);
  }
}
