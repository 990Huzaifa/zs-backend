import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsReceivableListQueryDto } from '../auth/dto/accounts-receivable.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { Client } from '../database/entities/client.entity';
import { TransactionsService } from './transactions.service';

type ArRow = {
  clientId: string | null;
  clientName: string;
  partyAccount: { id: string; code: string; name: string };
  outstandingBalance: number;
  periodDebit: number | null;
  periodCredit: number | null;
  currency: string;
};

@Injectable()
export class AccountsReceivableService {
  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly transactionsService: TransactionsService,
  ) {}

  async findAll(query: AccountsReceivableListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const dateFrom = query.dateFrom?.slice(0, 10) ?? null;
    const dateTo =
      query.dateTo?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

    if (dateFrom && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }

    const accounts = await this.coaRepo.find({
      where: {
        parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
        accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        isPostable: true,
      },
      order: { name: 'ASC' },
    });

    if (!accounts.length) {
      return this.emptyResponse(page, limit, dateFrom, dateTo);
    }

    const clients = await this.clientRepo.find({
      select: ['id', 'companyName'],
    });
    const clientByName = new Map(
      clients.map((c) => [c.companyName.trim().toLowerCase(), c]),
    );

    let filteredAccounts = accounts;

    if (query.clientId) {
      const client = clients.find((c) => c.id === query.clientId);
      if (!client) {
        return this.emptyResponse(page, limit, dateFrom, dateTo);
      }
      const name = client.companyName.trim().toLowerCase();
      filteredAccounts = accounts.filter(
        (a) => a.name.trim().toLowerCase() === name,
      );
    }

    const search = query.search?.trim().toLowerCase();
    if (search) {
      filteredAccounts = filteredAccounts.filter((a) =>
        a.name.toLowerCase().includes(search),
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

    const rows: ArRow[] = [];
    for (const account of filteredAccounts) {
      const outstanding = this.round2(balanceById.get(account.id) ?? 0);
      const movement = movementById?.get(account.id);
      const periodDebit = movement ? this.round2(movement.debit) : null;
      const periodCredit = movement ? this.round2(movement.credit) : null;

      // Hide zero-balance parties unless they moved in the selected period.
      if (
        outstanding === 0 &&
        (!movement || (movement.debit === 0 && movement.credit === 0))
      ) {
        continue;
      }

      const client =
        clientByName.get(account.name.trim().toLowerCase()) ?? null;

      rows.push({
        clientId: client?.id ?? null,
        clientName: client?.companyName ?? account.name,
        partyAccount: {
          id: account.id,
          code: account.code,
          name: account.name,
        },
        outstandingBalance: outstanding,
        periodDebit,
        periodCredit,
        currency: 'PKR',
      });
    }

    rows.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    const totalReceivable = this.round2(
      rows.reduce((sum, r) => sum + r.outstandingBalance, 0),
    );
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
        totalReceivable,
        partyCount: total,
        totalPeriodDebit,
        totalPeriodCredit,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalReceivable',
          title: 'Total Receivable',
          value: totalReceivable,
          currency: 'PKR',
        },
        {
          key: 'partyCount',
          title: 'Clients with Balance',
          value: total,
        },
        ...(totalPeriodDebit != null
          ? [
              {
                key: 'periodDebit',
                title: 'Period Invoiced',
                value: totalPeriodDebit,
                currency: 'PKR',
              },
              {
                key: 'periodCredit',
                title: 'Period Received',
                value: totalPeriodCredit,
                currency: 'PKR',
              },
            ]
          : []),
      ],
      filters: { dateFrom, dateTo },
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private emptyResponse(
    page: number,
    limit: number,
    dateFrom: string | null,
    dateTo: string,
  ) {
    return {
      summary: {
        totalReceivable: 0,
        partyCount: 0,
        totalPeriodDebit: dateFrom ? 0 : null,
        totalPeriodCredit: dateFrom ? 0 : null,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalReceivable',
          title: 'Total Receivable',
          value: 0,
          currency: 'PKR',
        },
        {
          key: 'partyCount',
          title: 'Clients with Balance',
          value: 0,
        },
      ],
      filters: { dateFrom, dateTo },
      data: [] as ArRow[],
      meta: { total: 0, page, limit, totalPages: 1 },
    };
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }
}
