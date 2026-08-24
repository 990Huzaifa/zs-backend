export interface DefaultChartOfAccountItem {
    code: string;
    parentCode: string | null;
    name: string;
    isPostable: boolean;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultChartOfAccountItem[] = [
    { code: '1', parentCode: null, name: 'Assets', isPostable: false },
    { code: '1-1', parentCode: '1', name: 'Current Assets', isPostable: false },
    { code: '1-1-1', parentCode: '1-1', name: 'Cash', isPostable: false },
    { code: '1-1-2', parentCode: '1-1', name: 'Bank', isPostable: false },
    { code: '1-1-3', parentCode: '1-1', name: 'Accounts Receivable', isPostable: false },
    { code: '1-1-3-1', parentCode: '1-1-3', name: 'Customer Receivables', isPostable: false },
    { code: '1-1-3-3', parentCode: '1-1-3', name: 'Employee Loan Receivables', isPostable: false },
    { code: '1-1-4', parentCode: '1-1', name: 'Inventory', isPostable: false },
    
    { code: '2', parentCode: null, name: 'Liabilities', isPostable: false },
    { code: '2-1', parentCode: '2', name: 'Current Liabilities', isPostable: false },
    { code: '2-1-1', parentCode: '2-1', name: 'Accounts Payable', isPostable: false },
    { code: '2-1-1-1', parentCode: '2-1-1', name: 'Vendor Payables', isPostable: false },
    { code: '2-1-1-2', parentCode: '2-1-1', name: 'Driver Payables', isPostable: false },
    { code: '2-1-1-3', parentCode: '2-1-1', name: 'Employee Loan Payables', isPostable: false },
    { code: '2-1-2', parentCode: '2-1', name: 'Salaries Payable', isPostable: false },
    { code: '2-1-3', parentCode: '2-1', name: 'Tax Payable', isPostable: false },
    { code: '2-1-6', parentCode: '2-1', name: 'Provident Fund Payable', isPostable: false },
    { code: '2-1-4', parentCode: '2-1', name: 'Short-Term Loans Payable', isPostable: false },
    { code: '2-1-5', parentCode: '2-1', name: 'Long-Term Loans Payable', isPostable: false },
    

    { code: '3', parentCode: null, name: 'Equity', isPostable: false },
    { code: '3-1', parentCode: '3', name: 'Owner Capital', isPostable: false },
    { code: '4', parentCode: null, name: 'Income', isPostable: false },
    { code: '5', parentCode: null, name: 'Expenses', isPostable: false },
];

