import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsPayableListQueryDto } from '../auth/dto/accounts-payable.dto';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { Vendor } from '../database/entities/vendor.entity';
import { TransactionsService } from './transactions.service';

type ApRow = {
  vendorId: string | null;
  vendorName: string;
  partyAccount: { id: string; code: string; name: string };
  outstandingBalance: number;
  periodDebit: number | null;
  periodCredit: number | null;
  currency: string;
};

@Injectable()
export class AccountsPayableService {
  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    private readonly transactionsService: TransactionsService,
  ) {}

  async findAll(query: AccountsPayableListQueryDto) {
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
        parentCode: COA_PARENT_CODES.VENDOR_PAYABLES,
        accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        isPostable: true,
      },
      order: { name: 'ASC' },
    });

    if (!accounts.length) {
      return this.emptyResponse(page, limit, dateFrom, dateTo);
    }

    const vendors = await this.vendorRepo.find({
      select: ['id', 'ownerName', 'vendorName'],
    });
    const vendorByName = new Map<string, Vendor>();
    for (const v of vendors) {
      vendorByName.set(this.getDisplayName(v).trim().toLowerCase(), v);
    }

    let filteredAccounts = accounts;

    if (query.vendorId) {
      const vendor = vendors.find((v) => v.id === query.vendorId);
      if (!vendor) {
        return this.emptyResponse(page, limit, dateFrom, dateTo);
      }
      const name = this.getDisplayName(vendor).trim().toLowerCase();
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

    const rows: ApRow[] = [];
    for (const account of filteredAccounts) {
      const outstanding = this.round2(balanceById.get(account.id) ?? 0);
      const movement = movementById?.get(account.id);
      const periodDebit = movement ? this.round2(movement.debit) : null;
      const periodCredit = movement ? this.round2(movement.credit) : null;

      if (
        outstanding === 0 &&
        (!movement || (movement.debit === 0 && movement.credit === 0))
      ) {
        continue;
      }

      const vendor =
        vendorByName.get(account.name.trim().toLowerCase()) ?? null;

      rows.push({
        vendorId: vendor?.id ?? null,
        vendorName: vendor ? this.getDisplayName(vendor) : account.name,
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

    const totalPayable = this.round2(
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
        totalPayable,
        partyCount: total,
        totalPeriodDebit,
        totalPeriodCredit,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalPayable',
          title: 'Total Payable',
          value: totalPayable,
          currency: 'PKR',
        },
        {
          key: 'partyCount',
          title: 'Vendors with Balance',
          value: total,
        },
        ...(totalPeriodDebit != null
          ? [
              {
                key: 'periodCredit',
                title: 'Period Accrued',
                value: totalPeriodCredit,
                currency: 'PKR',
              },
              {
                key: 'periodDebit',
                title: 'Period Paid',
                value: totalPeriodDebit,
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

  private getDisplayName(vendor: Vendor): string {
    const trimmedVendor = vendor.vendorName?.trim();
    return trimmedVendor || vendor.ownerName;
  }

  private emptyResponse(
    page: number,
    limit: number,
    dateFrom: string | null,
    dateTo: string,
  ) {
    return {
      summary: {
        totalPayable: 0,
        partyCount: 0,
        totalPeriodDebit: dateFrom ? 0 : null,
        totalPeriodCredit: dateFrom ? 0 : null,
        currency: 'PKR',
      },
      cards: [
        {
          key: 'totalPayable',
          title: 'Total Payable',
          value: 0,
          currency: 'PKR',
        },
        {
          key: 'partyCount',
          title: 'Vendors with Balance',
          value: 0,
        },
      ],
      filters: { dateFrom, dateTo },
      data: [] as ApRow[],
      meta: { total: 0, page, limit, totalPages: 1 },
    };
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }
}
