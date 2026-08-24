import { ChartOfAccountType } from './chart-of-account-type.enum';

export type BusinessChartOfAccountTypeConfig = {
  parentCode: string;
  label: string;
};

/** Maps account type → default chart parent for auto-created postable accounts. */
export const BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG: Record<
  ChartOfAccountType,
  BusinessChartOfAccountTypeConfig
> = {
  [ChartOfAccountType.CASH]: { parentCode: '1-1-1', label: 'Cash' },
  [ChartOfAccountType.BANK]: { parentCode: '1-1-2', label: 'Bank' },
  [ChartOfAccountType.INVENTORY]: { parentCode: '1-1-4', label: 'Inventory' },
  [ChartOfAccountType.BUSINESS_EXPENSE]: {
    parentCode: '5',
    label: 'Expense',
  },
  [ChartOfAccountType.BUSINESS_INCOME]: {
    parentCode: '4',
    label: 'Income',
  },
  [ChartOfAccountType.OWNER_CAPITAL]: {
    parentCode: '3-1',
    label: 'Owner Capital',
  },
  [ChartOfAccountType.SALARIES_PAYABLE]: {
    parentCode: '2-1-2',
    label: 'Salaries Payable',
  },
  [ChartOfAccountType.TAX_PAYABLE]: {
    parentCode: '2-1-3',
    label: 'Tax Payable',
  },
  [ChartOfAccountType.SHORT_TERM_LOAN_PAYABLE]: {
    parentCode: '2-1-4',
    label: 'Short-Term Loan Payable',
  },
  [ChartOfAccountType.LONG_TERM_LOAN_PAYABLE]: {
    parentCode: '2-1-5',
    label: 'Long-Term Loan Payable',
  },
};

export function resolveChartOfAccountTypeFromParent(
  parentCode: string | null,
): ChartOfAccountType | null {
  if (!parentCode) {
    return null;
  }
  const entry = Object.entries(BUSINESS_CHART_OF_ACCOUNT_TYPE_CONFIG).find(
    ([, config]) => config.parentCode === parentCode,
  );
  return entry ? (entry[0] as ChartOfAccountType) : null;
}
