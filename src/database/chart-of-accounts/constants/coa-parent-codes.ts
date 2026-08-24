/** Default chart parent codes used when creating linked accounts. */
export const COA_PARENT_CODES = {
  INVENTORY: '1-1-4',
  CASH: '1-1-1',
  BANK: '1-1-2',
  CUSTOMER_RECEIVABLES: '1-1-3-1',
  VENDOR_PAYABLES: '2-1-1-1',
  DRIVER_PAYABLES: '2-1-1-2',
  BUSINESS_EXPENSE: '5',
  BUSINESS_INCOME: '4',
  OWNER_CAPITAL: '3-1',
  SALARIES_PAYABLE: '2-1-2',
  TAX_PAYABLE: '2-1-3',
  PROVIDENT_FUND_PAYABLE: '2-1-6',
  SHORT_TERM_LOAN_PAYABLE: '2-1-4',
  LONG_TERM_LOAN_PAYABLE: '2-1-5',
} as const;
