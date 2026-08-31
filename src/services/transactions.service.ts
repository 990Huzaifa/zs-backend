import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TransactionListQueryDto } from '../auth/dto/transaction.dto';
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
   * Append a ledger line and update running `currentBalance`
   * (`prev + debit - credit`). Optional `manager` keeps it in the caller's DB tx.
   */
  async postEntry(
    input: PostLedgerEntryInput,
    manager?: EntityManager,
  ): Promise<Transaction> {
    const txRepo = manager
      ? manager.getRepository(Transaction)
      : this.transactionRepo;
    const coaRepo = manager
      ? manager.getRepository(ChartOfAccount)
      : this.coaRepo;

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

    const previous = await this.getLatestBalanceForAccount(
      input.chartOfAccountId,
      txRepo,
    );
    const debitNum = debit ?? 0;
    const creditNum = credit ?? 0;
    const nextBalance = previous + debitNum - creditNum;
    const date =
      typeof input.transactionDate === 'string'
        ? (input.transactionDate.slice(0, 10) as unknown as Date)
        : input.transactionDate;

    return txRepo.save(
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
        currentBalance: nextBalance.toFixed(2) as unknown as number,
      }),
    );
  }

  private async getLatestBalanceForAccount(
    chartOfAccountId: string,
    txRepo: Repository<Transaction>,
  ): Promise<number> {
    const latest = await txRepo.findOne({
      where: { chartOfAccountId },
      order: { transactionDate: 'DESC', createdAt: 'DESC' },
    });
    return latest ? Number(latest.currentBalance) || 0 : 0;
  }

  private normalizeAmount(value?: number | null): number | null {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('Amount must be a non-negative number');
    }
    if (n === 0) return null;
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
