import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ChangeExpenseVoucherStatusDto,
  CreateExpenseVoucherBatchDto,
  CreateExpenseVoucherEntryDto,
  ExpenseVoucherListQueryDto,
  UpdateExpenseVoucherDto,
} from '../../auth/dto/expense-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import {
  EXPENSE_VOUCHER_PREFIX,
  nextSerialCode,
} from '../../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { ExpenseVoucher } from '../../database/entities/expense-voucher.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { TransactionsService } from '../transactions.service';

@Injectable()
export class ExpenseVouchersService {
  constructor(
    @InjectRepository(ExpenseVoucher)
    private readonly expenseRepo: Repository<ExpenseVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Batch create — one shared status for all entries.
   * PENDING = draft; PAID = insert + post ledger for every row.
   */
  async createBatch(
    dto: CreateExpenseVoucherBatchDto,
    activity?: ActivityActorContext,
  ) {
    if (
      dto.status !== VoucherStatus.PENDING &&
      dto.status !== VoucherStatus.PAID
    ) {
      throw new BadRequestException(
        'Batch create status must be PENDING or PAID',
      );
    }

    for (let i = 0; i < dto.entries.length; i++) {
      const entry = dto.entries[i];
      try {
        await this.validateAccounts(entry.assetAccId, entry.expenseAccId);
        this.validateChequeFields(
          entry.paymentMethod,
          entry.chequeNumber,
          entry.chequeDate,
        );
        this.formatAmount(entry.paymentAmount);
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw new BadRequestException(
            `entries[${i}]: ${err.message}`,
          );
        }
        throw err;
      }
    }

    const createdBy = activity?.actor?.id ?? null;

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ExpenseVoucher);
      const ids: string[] = [];

      for (let i = 0; i < dto.entries.length; i++) {
        const entry = dto.entries[i];
        const voucherNumber = await this.generateUniqueVoucherNumber(
          repo,
          i,
        );
        const row = await repo.save(
          repo.create(this.buildEntityPayload(entry, {
            voucherNumber,
            status: dto.status,
            createdBy,
          })),
        );
        ids.push(row.id);

        if (dto.status === VoucherStatus.PAID) {
          await this.postExpenseLedger(row, manager);
        }
      }

      return ids;
    });

    const rows = await this.expenseRepo.find({
      where: { id: In(savedIds) },
      relations: {
        assetAcc: true,
        expenseAcc: true,
        createdByUser: true,
      },
      order: { voucherNumber: 'ASC' },
    });

    const numbers = rows.map((r) => r.voucherNumber).join(', ');
    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'ExpenseVoucher',
        entityId: rows[0]?.id ?? null,
        record: numbers,
        description:
          dto.status === VoucherStatus.PAID
            ? `Created and paid ${rows.length} expense voucher(s): ${numbers}`
            : `Created ${rows.length} expense voucher draft(s): ${numbers}`,
        metadata: { status: dto.status, count: rows.length, ids: savedIds },
      },
      activity,
    );

    return { data: rows.map((row) => this.toResponse(row)) };
  }

  async findAll(query: ExpenseVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.expenseRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.assetAcc', 'assetAcc')
      .leftJoinAndSelect('voucher.expenseAcc', 'expenseAcc')
      .leftJoinAndSelect('voucher.createdByUser', 'createdByUser')
      .orderBy('voucher.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('voucher.status = :status', { status: query.status });
    }
    if (query.paymentMethod) {
      qb.andWhere('voucher.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.assetAccId) {
      qb.andWhere('voucher.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
      });
    }
    if (query.expenseAccId) {
      qb.andWhere('voucher.expenseAccId = :expenseAccId', {
        expenseAccId: query.expenseAccId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('voucher.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('voucher.paymentDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          voucher.voucherNumber ILIKE :search
          OR voucher.remarks ILIKE :search
          OR voucher.chequeNumber ILIKE :search
          OR assetAcc.name ILIKE :search
          OR assetAcc.code ILIKE :search
          OR expenseAcc.name ILIKE :search
          OR expenseAcc.code ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.findByIdOrFail(id));
  }

  async update(
    id: string,
    dto: UpdateExpenseVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const voucher = await this.findByIdOrFail(id);
    if (voucher.status !== VoucherStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING expense vouchers can be updated',
      );
    }

    const nextAsset = dto.assetAccId ?? voucher.assetAccId;
    const nextExpense = dto.expenseAccId ?? voucher.expenseAccId;
    if (dto.assetAccId !== undefined || dto.expenseAccId !== undefined) {
      await this.validateAccounts(nextAsset, nextExpense);
    }

    const nextMethod = dto.paymentMethod ?? voucher.paymentMethod;
    const nextChequeNumber =
      dto.chequeNumber !== undefined
        ? this.nullableTrim(dto.chequeNumber)
        : voucher.chequeNumber;
    const nextChequeDate =
      dto.chequeDate !== undefined
        ? dto.chequeDate
          ? this.toDateOnly(dto.chequeDate)
          : null
        : voucher.chequeDate;

    this.validateChequeFields(nextMethod, nextChequeNumber, nextChequeDate);

    if (dto.assetAccId !== undefined) voucher.assetAccId = dto.assetAccId;
    if (dto.expenseAccId !== undefined) voucher.expenseAccId = dto.expenseAccId;
    if (dto.paymentMethod !== undefined) {
      voucher.paymentMethod = dto.paymentMethod;
    }
    if (dto.paymentDate !== undefined) {
      voucher.paymentDate = this.toDateOnly(dto.paymentDate);
    }
    if (dto.paymentAmount !== undefined) {
      voucher.paymentAmount = this.formatAmount(
        dto.paymentAmount,
      ) as unknown as number;
    }
    if (dto.remarks !== undefined) {
      voucher.remarks = this.nullableTrim(dto.remarks);
    }

    if (nextMethod === PaymentMethod.CHEQUE) {
      voucher.chequeNumber = nextChequeNumber;
      voucher.chequeDate = nextChequeDate;
    } else {
      voucher.chequeNumber = null;
      voucher.chequeDate = null;
    }

    await this.expenseRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ExpenseVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Updated expense voucher ${voucher.voucherNumber}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeExpenseVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ExpenseVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          assetAcc: true,
          expenseAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Expense voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postExpenseLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ExpenseVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed expense voucher ${result.voucherNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  private buildEntityPayload(
    entry: CreateExpenseVoucherEntryDto,
    meta: {
      voucherNumber: string;
      status: VoucherStatus;
      createdBy: string | null;
    },
  ): Partial<ExpenseVoucher> {
    return {
      voucherNumber: meta.voucherNumber,
      assetAccId: entry.assetAccId,
      expenseAccId: entry.expenseAccId,
      paymentMethod: entry.paymentMethod,
      chequeNumber:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? entry.chequeNumber!.trim()
          : null,
      chequeDate:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? this.toDateOnly(entry.chequeDate!)
          : null,
      paymentDate: this.toDateOnly(entry.paymentDate),
      paymentAmount: this.formatAmount(
        entry.paymentAmount,
      ) as unknown as number,
      remarks: this.nullableTrim(entry.remarks),
      createdBy: meta.createdBy,
      status: meta.status,
    };
  }

  private async postExpenseLedger(
    voucher: ExpenseVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const desc =
      voucher.remarks?.trim() ||
      `Expense voucher ${voucher.voucherNumber}`;

    // Asset (cash/bank): credit — money out
    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.assetAccId,
        referenceType: AccountTransactionReferenceType.EXPENSE_VOUCHER_ASSET,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        creditAmount: amount,
        idempotent: true,
      },
      manager,
    );

    // Expense account: debit
    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.expenseAccId,
        referenceType: AccountTransactionReferenceType.EXPENSE_VOUCHER_EXPENSE,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private assertStatusTransition(
    current: VoucherStatus,
    next: VoucherStatus,
  ) {
    if (current === next) {
      throw new BadRequestException(`Voucher is already ${current}`);
    }
    if (current === VoucherStatus.CANCELLED) {
      throw new BadRequestException('Cancelled vouchers cannot change status');
    }
    if (current === VoucherStatus.PAID) {
      throw new BadRequestException(
        'Paid vouchers cannot change status (ledger already posted)',
      );
    }
    if (
      next !== VoucherStatus.PAID &&
      next !== VoucherStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pending vouchers can only move to PAID or CANCELLED',
      );
    }
  }

  private async validateAccounts(assetAccId: string, expenseAccId: string) {
    if (assetAccId === expenseAccId) {
      throw new BadRequestException(
        'Asset and expense accounts must be different',
      );
    }

    const [assetAcc, expenseAcc] = await Promise.all([
      this.coaRepo.findOne({ where: { id: assetAccId } }),
      this.coaRepo.findOne({ where: { id: expenseAccId } }),
    ]);

    if (!assetAcc) {
      throw new BadRequestException('Asset account not found');
    }
    if (!expenseAcc) {
      throw new BadRequestException('Expense account not found');
    }
    if (!assetAcc.isPostable) {
      throw new BadRequestException(
        `Asset account ${assetAcc.code} is not postable`,
      );
    }
    if (!expenseAcc.isPostable) {
      throw new BadRequestException(
        `Expense account ${expenseAcc.code} is not postable`,
      );
    }
  }

  private validateChequeFields(
    method: PaymentMethod,
    chequeNumber?: string | null,
    chequeDate?: string | Date | null,
  ) {
    if (method !== PaymentMethod.CHEQUE) return;
    if (!chequeNumber?.toString().trim()) {
      throw new BadRequestException(
        'chequeNumber is required for CHEQUE payments',
      );
    }
    if (!chequeDate) {
      throw new BadRequestException(
        'chequeDate is required for CHEQUE payments',
      );
    }
  }

  private async findByIdOrFail(id: string): Promise<ExpenseVoucher> {
    const voucher = await this.expenseRepo.findOne({
      where: { id },
      relations: {
        assetAcc: true,
        expenseAcc: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Expense voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<ExpenseVoucher> = this.expenseRepo,
    skipBase: number = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        EXPENSE_VOUCHER_PREFIX,
        'voucherNumber',
        6,
        skipBase + attempt,
      );
      const existing = await repo.findOne({
        where: { voucherNumber: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique expense voucher number',
    );
  }

  private formatAmount(value: number): string {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('paymentAmount must be greater than 0');
    }
    return n.toFixed(2);
  }

  private toDateOnly(value: string | Date): Date {
    if (typeof value === 'string') {
      return value.slice(0, 10) as unknown as Date;
    }
    return value;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toAccountSummary(acc?: ChartOfAccount | null) {
    if (!acc) return null;
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      parentCode: acc.parentCode,
      isPostable: acc.isPostable,
    };
  }

  private toResponse(voucher: ExpenseVoucher) {
    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      assetAccId: voucher.assetAccId,
      expenseAccId: voucher.expenseAccId,
      paymentMethod: voucher.paymentMethod,
      chequeNumber: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      paymentDate: voucher.paymentDate,
      paymentAmount: Number(voucher.paymentAmount).toFixed(2),
      remarks: voucher.remarks,
      createdBy: voucher.createdBy,
      status: voucher.status,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
      assetAcc: this.toAccountSummary(voucher.assetAcc),
      expenseAcc: this.toAccountSummary(voucher.expenseAcc),
      createdByUser: voucher.createdByUser
        ? {
            id: voucher.createdByUser.id,
            name: voucher.createdByUser.name,
            email: voucher.createdByUser.email,
          }
        : null,
    };
  }
}
