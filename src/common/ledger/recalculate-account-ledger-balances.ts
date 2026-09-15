import { EntityManager } from 'typeorm';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { Transaction } from '../../database/entities/transaction.entity';
import { applyLedgerBalanceDelta } from './account-balance-sign';

/**
 * Rebuild running `currentBalance` for every ledger line on one account.
 * Order: transactionDate ASC, then createdAt ASC.
 * Sign follows account type (level1): debit-normal vs credit-normal.
 */
export async function recalculateAccountLedgerBalances(
  manager: EntityManager,
  chartOfAccountId: string,
): Promise<void> {
  const txRepo = manager.getRepository(Transaction);
  const coaRepo = manager.getRepository(ChartOfAccount);

  const account = await coaRepo.findOne({ where: { id: chartOfAccountId } });
  if (!account) {
    return;
  }

  const rows = await txRepo.find({
    where: { chartOfAccountId },
    order: { transactionDate: 'ASC', createdAt: 'ASC' },
  });

  let balance = 0;
  for (const row of rows) {
    const debit = Number(row.debitAmount) || 0;
    const credit = Number(row.creditAmount) || 0;
    balance = applyLedgerBalanceDelta(balance, debit, credit, account.level1);
    row.currentBalance = balance.toFixed(2) as unknown as number;
  }

  if (rows.length) {
    await txRepo.save(rows);
  }
}
