import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CashBankAccountTypeFilter,
  CashBankBalanceListQueryDto,
} from '../auth/dto/cash-bank-balance.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { TransactionsService } from './transactions.service';

type CashBankRow = {
  accountType: CashBankAccountTypeFilter;
  account: { id: string; code: string; name: string };
  balance: number;
  periodDebit: number | null;
  periodCredit: number | null;
  currency: string;
};

@Injectable()
export class CashBankBalanceService {
  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly transactionsService: TransactionsService,
  ) {}

  async findAll(query: CashBankBalanceListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const dateFrom = query.dateFrom?.slice(0, 10) ?? null;
    const dateTo =
      query.dateTo?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

    if (dateFrom && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }

    const parentCodes = this.resolveParentCodes(query.accountType);

    const accounts = await this.coaRepo.find({
      where: {
        parentCode: In(parentCodes),
        accountKind: ChartOfAccountKind.BUSINESS,
        isPostable: true,
      },
      order: { name: 'ASC' },
    });

    if (!accounts.length) {
      return this.emptyResponse(page, limit, dateFrom, dateTo);
    }

    let filteredAccounts = accounts;
    const search = query.search?.trim().toLowerCase();
    if (search) {
      filteredAccounts = filteredAccounts.filter(
        (a) =>
          a.name.toLowerCase().includes(search) ||
          a.code.toLowerCase().includes(search),
      );
    }

    const accountIds = filteredAccounts.map((a) => a.id);
    const balanceById =
      await this.transactionsService.getLatestBalancesByAccountIds(
        accountIds,
        dateTo,
      );

    const movementById =
      dateFrom != null
        ? await this.transactionsService.getPeriodMovementByAccountIds(
            accountIds,
            dateFrom,
            dateTo,
          )
        : null;

    const rows: CashBankRow[] = [];
    for (const account of filteredAccounts) {
      const balance = this.round2(balanceById.get(account.id) ?? 0);
      const movement = movementById?.get(account.id);
      const periodDebit = movement ? this.round2(movement.debit) : null;
      const periodCredit = movement ? this.round2(movement.credit) : null;

      if (
        balance === 0 &&
        (!movement || (movement.debit === 0 && movement.credit === 0))
      ) {
        continue;
      }

      rows.push({
        accountType: this.accountTypeOf(account.parentCode),
        account: {
          id: account.id,
          code: account.code,
          name: account.name,
        },
        balance,
        periodDebit,
        periodCredit,
        currency: 'PKR',
      });
    }

    rows.sort((a, b) => b.balance - a.balance);

    const totalCash = this.round2(
      rows
        .filter((r) => r.accountType === CashBankAccountTypeFilter.CASH)
        .reduce((sum, r) => sum + r.balance, 0),
    );
    const totalBank = this.round2(
      rows
        .filter((r) => r.accountType === CashBankAccountTypeFilter.BANK)
        .reduce((sum, r) => sum + r.balance, 0),
    );
    const totalBalance = this.round2(totalCash + totalBank);
    const totalPeriodDebit = movementById
      ? this.round2(rows.reduce((sum, r) => sum + (r.periodDebit ?? 0), 0))
      : null;
    const totalPeriodCredit = movementById
      ? this.round2(rows.reduce((sum, r) => sum + (r.periodCredit ?? 0), 0))
      : null;

    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    return {
      summary: {
        totalCash,
        totalBank,
        totalBalance,
        accountCount: total,
        totalPeriodDebit,
        totalPeriodCredit,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalCash',
          title: 'Total Cash',
          value: totalCash,
          currency: 'PKR',
        },
        {
          key: 'totalBank',
          title: 'Total Bank',
          value: totalBank,
          currency: 'PKR',
        },
        {
          key: 'totalBalance',
          title: 'Cash & Bank Total',
          value: totalBalance,
          currency: 'PKR',
        },
        {
          key: 'accountCount',
          title: 'Accounts with Balance',
          value: total,
        },
        ...(totalPeriodDebit != null
          ? [
              {
                key: 'periodDebit',
                title: 'Period Inflow',
                value: totalPeriodDebit,
                currency: 'PKR',
              },
              {
                key: 'periodCredit',
                title: 'Period Outflow',
                value: totalPeriodCredit,
                currency: 'PKR',
              },
            ]
          : []),
      ],
      filters: {
        dateFrom,
        dateTo,
        accountType: query.accountType ?? null,
      },
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private resolveParentCodes(
    accountType?: CashBankAccountTypeFilter,
  ): string[] {
    if (accountType === CashBankAccountTypeFilter.CASH) {
      return [COA_PARENT_CODES.CASH];
    }
    if (accountType === CashBankAccountTypeFilter.BANK) {
      return [COA_PARENT_CODES.BANK];
    }
    return [COA_PARENT_CODES.CASH, COA_PARENT_CODES.BANK];
  }

  private accountTypeOf(parentCode: string | null): CashBankAccountTypeFilter {
    if (parentCode === COA_PARENT_CODES.BANK) {
      return CashBankAccountTypeFilter.BANK;
    }
    return CashBankAccountTypeFilter.CASH;
  }

  private emptyResponse(
    page: number,
    limit: number,
    dateFrom: string | null,
    dateTo: string,
  ) {
    return {
      summary: {
        totalCash: 0,
        totalBank: 0,
        totalBalance: 0,
        accountCount: 0,
        totalPeriodDebit: dateFrom ? 0 : null,
        totalPeriodCredit: dateFrom ? 0 : null,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalCash',
          title: 'Total Cash',
          value: 0,
          currency: 'PKR',
        },
        {
          key: 'totalBank',
          title: 'Total Bank',
          value: 0,
          currency: 'PKR',
        },
        {
          key: 'totalBalance',
          title: 'Cash & Bank Total',
          value: 0,
          currency: 'PKR',
        },
        {
          key: 'accountCount',
          title: 'Accounts with Balance',
          value: 0,
        },
      ],
      filters: { dateFrom, dateTo, accountType: null },
      data: [] as CashBankRow[],
      meta: { total: 0, page, limit, totalPages: 1 },
    };
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }
}
