import { ClientCategory } from '../entities/client.entity';
import { ChartOfAccountKind } from '../entities/chart-of-account.entity';
import { COA_PARENT_CODES } from './constants/coa-parent-codes';

export type ClientPartyAccountTarget = {
  parentCode: string;
  accountKind: ChartOfAccountKind;
};

/**
 * Party COA leaves for a client category.
 * COMPANY → customer AR; BROKER/TRANSPORTER → AR + AP under their parents.
 */
export function clientPartyAccountTargets(
  category: ClientCategory,
): ClientPartyAccountTarget[] {
  switch (category) {
    case ClientCategory.BROKER:
      return [
        {
          parentCode: COA_PARENT_CODES.BROKER_RECEIVABLES,
          accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        },
        {
          parentCode: COA_PARENT_CODES.BROKER_PAYABLES,
          accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        },
      ];
    case ClientCategory.TRANSPORTER:
      return [
        {
          parentCode: COA_PARENT_CODES.TRANSPORTER_RECEIVABLES,
          accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        },
        {
          parentCode: COA_PARENT_CODES.TRANSPORTER_PAYABLES,
          accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        },
      ];
    case ClientCategory.COMPANY:
    default:
      return [
        {
          parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
          accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        },
      ];
  }
}

/** Receivable parent used by invoices / vouchers / ledger. */
export function clientReceivableParentCode(category: ClientCategory): string {
  const receivable = clientPartyAccountTargets(category).find(
    (t) => t.accountKind === ChartOfAccountKind.PARTY_RECEIVABLE,
  );
  return receivable?.parentCode ?? COA_PARENT_CODES.CUSTOMER_RECEIVABLES;
}

/** Payable parent for broker/transporter freights (COMPANY has none). */
export function clientPayableParentCode(category: ClientCategory): string {
  const payable = clientPartyAccountTargets(category).find(
    (t) => t.accountKind === ChartOfAccountKind.PARTY_PAYABLE,
  );
  if (!payable) {
    throw new Error(
      `Client category ${category} has no payable parent code`,
    );
  }
  return payable.parentCode;
}
