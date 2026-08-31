import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TransactionListQueryDto } from '../auth/dto/transaction.dto';
import { recalculateAccountLedgerBalances } from '../common/ledger/recalculate-account-ledger-balances';
import { ChartOfAccount } from '../database/entities/chart-of-account.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from '../database/entities/transaction.entity';

export type PostLedgerEntryInput = {
  chartOfAccountId: string;
  referenceType: AccountTransactionReferenceType;
  referenceId: string;
  transactionDate: string | Date;
  description?: string | null;
  /** Exactly one of debit/credit should be > 0 */
  debitAmount?: number | null;
  creditAmount?: number | null;
  /** Skip insert if a row already exists for this reference (idempotent). */
  idempotent?: boolean;
};

export type UpdateReferencedCreditInput = {
  referenceType: AccountTransactionReferenceType;
  referenceId: string;
  creditAmount: number;
  transactionDate: string | Date;
  description?: string | null;
};

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  async findAll(query: TransactionListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.chartOfAccount', 'coa')
      .orderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.chartOfAccountId) {
      qb.andWhere('tx.chartOfAccountId = :chartOfAccountId', {
        chartOfAccountId: query.chartOfAccountId,
      });
    }
    if (query.referenceType) {
      qb.andWhere('tx.referenceType = :referenceType', {
        referenceType: query.referenceType,
      });
    }
    if (query.referenceId) {
      qb.andWhere('tx.referenceId = :referenceId', {
        referenceId: query.referenceId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('tx.transactionDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('tx.transactionDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          tx.description ILIKE :search
          OR coa.name ILIKE :search
          OR coa.code ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((tx) => this.toResponse(tx)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const tx = await this.transactionRepo.findOne({
      where: { id },
      relations: { chartOfAccount: true },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    return this.toResponse(tx);
  }

  async findByAccount(chartOfAccountId: string, query: TransactionListQueryDto) {
    const exists = await this.coaRepo.exist({ where: { id: chartOfAccountId } });
    if (!exists) {
      throw new NotFoundException('Chart of account not found');
    }
    return this.findAll({ ...query, chartOfAccountId });
  }

  /**
   * Latest ledger `currentBalance` per account (by transactionDate, then createdAt).
   * Used by COA tree/flat views.
   */
  async getLatestBalancesByAccountIds(
    accountIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!accountIds.length) return map;

    const rows = await this.transactionRepo
      .createQueryBuilder('tx')
      .distinctOn(['tx.chartOfAccountId'])
      .select('tx.chartOfAccountId', 'chartOfAccountId')
      .addSelect('tx.currentBalance', 'currentBalance')
      .where('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
      .orderBy('tx.chartOfAccountId', 'ASC')
      .addOrderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .getRawMany<{ chartOfAccountId: string; currentBalance: string }>();

    for (const row of rows) {
      map.set(row.chartOfAccountId, Number(row.currentBalance) || 0);
    }
    return map;
  }

  /**
   * Append a ledger line, then fully recalculate that account's running balances
   * (so past-dated posts stay chronologically correct).
   */
  async postEntry(
    input: PostLedgerEntryInput,
    manager?: EntityManager,
  ): Promise<Transaction> {
    const em = manager ?? this.transactionRepo.manager;
    const txRepo = em.getRepository(Transaction);
    const coaRepo = em.getRepository(ChartOfAccount);

    if (input.idempotent !== false) {
      const existing = await txRepo.findOne({
        where: {
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
      });
      if (existing) return existing;
    }

    const account = await coaRepo.findOne({
      where: { id: input.chartOfAccountId },
    });
    if (!account) {
      throw new BadRequestException(
        `Chart of account not found: ${input.chartOfAccountId}`,
      );
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `Account ${account.code} is not postable`,
      );
    }

    const debit = this.normalizeAmount(input.debitAmount);
    const credit = this.normalizeAmount(input.creditAmount);
    if (debit === null && credit === null) {
      throw new BadRequestException('debitAmount or creditAmount is required');
    }
    if (debit !== null && credit !== null) {
      throw new BadRequestException(
        'Provide only one of debitAmount or creditAmount',
      );
    }

    const date = this.toDateOnly(input.transactionDate);

    const saved = await txRepo.save(
      txRepo.create({
        chartOfAccountId: input.chartOfAccountId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        transactionDate: date,
        description: input.description?.trim() || null,
        debitAmount:
          debit === null ? null : (debit.toFixed(2) as unknown as number),
        creditAmount:
          credit === null ? null : (credit.toFixed(2) as unknown as number),
        // Placeholder; recalculateAccountLedgerBalances sets the real value.
        currentBalance: '0' as unknown as number,
      }),
    );

    await recalculateAccountLedgerBalances(em, input.chartOfAccountId);
    return (await txRepo.findOneBy({ id: saved.id })) ?? saved;
  }

  /**
   * Update an existing credit line (e.g. paid trip expense) then recalculate
   * that account's ledger. Account / debit side are not changed.
   */
  async updateReferencedCreditEntry(
    input: UpdateReferencedCreditInput,
    manager?: EntityManager,
  ): Promise<Transaction> {
    const em = manager ?? this.transactionRepo.manager;
    const txRepo = em.getRepository(Transaction);

    const row = await txRepo.findOne({
      where: {
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });
    if (!row) {
      throw new BadRequestException(
        'Ledger entry not found for this paid expense',
      );
    }

    const credit = this.normalizeAmount(input.creditAmount, { allowZero: true });
    if (credit === null) {
      throw new BadRequestException('creditAmount is required');
    }

    row.creditAmount = credit.toFixed(2) as unknown as number;
    row.debitAmount = null;
    row.transactionDate = this.toDateOnly(input.transactionDate);
    if (input.description !== undefined) {
      row.description = input.description?.trim() || null;
    }

    await txRepo.save(row);
    await recalculateAccountLedgerBalances(em, row.chartOfAccountId);
    return (await txRepo.findOneBy({ id: row.id })) ?? row;
  }

  /** Public wrapper for callers that already mutated a ledger row. */
  async recalculateAccount(
    chartOfAccountId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.transactionRepo.manager;
    await recalculateAccountLedgerBalances(em, chartOfAccountId);
  }

  private toDateOnly(value: string | Date): Date {
    if (typeof value === 'string') {
      return value.slice(0, 10) as unknown as Date;
    }
    return value;
  }

  private normalizeAmount(
    value?: number | null,
    opts?: { allowZero?: boolean },
  ): number | null {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('Amount must be a non-negative number');
    }
    if (n === 0) return opts?.allowZero ? 0 : null;
    return Math.round(n * 100) / 100;
  }

  private toResponse(tx: Transaction) {
    return {
      id: tx.id,
      chartOfAccountId: tx.chartOfAccountId,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      transactionDate: tx.transactionDate,
      description: tx.description,
      debitAmount:
        tx.debitAmount === null || tx.debitAmount === undefined
          ? null
          : Number(tx.debitAmount).toFixed(2),
      creditAmount:
        tx.creditAmount === null || tx.creditAmount === undefined
          ? null
          : Number(tx.creditAmount).toFixed(2),
      currentBalance: Number(tx.currentBalance || 0).toFixed(2),
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      chartOfAccount: tx.chartOfAccount
        ? {
            id: tx.chartOfAccount.id,
            code: tx.chartOfAccount.code,
            name: tx.chartOfAccount.name,
            parentCode: tx.chartOfAccount.parentCode,
            isPostable: tx.chartOfAccount.isPostable,
          }
        : null,
    };
  }
}
