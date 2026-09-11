import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BiltyExpenseListQueryDto,
  ChangeBiltyExpenseStatusDto,
  CreateBiltyExpenseDto,
  UpdateBiltyExpenseDto,
} from '../auth/dto/bilty.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Bilty,
  BiltyExpense,
  BiltyExpenseStatus,
} from '../database/entities/bilty.entity';
import { ChartOfAccount } from '../database/entities/chart-of-account.entity';
import { AccountTransactionReferenceType } from '../database/entities/transaction.entity';
import { ActivitiesService } from './activities.service';
import { TransactionsService } from './transactions.service';

@Injectable()
export class BiltyExpensesService {
  constructor(
    @InjectRepository(BiltyExpense)
    private readonly expenseRepo: Repository<BiltyExpense>,
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    biltyId: string,
    dto: CreateBiltyExpenseDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);
    await this.validateExpenseAccount(dto.expenseAccId);

    const saved = await this.expenseRepo.save(
      this.expenseRepo.create({
        biltyId,
        expenseAccId: dto.expenseAccId,
        amount: this.formatAmount(dto.amount) as unknown as number,
        description: this.nullableTrim(dto.description),
        status: BiltyExpenseStatus.PENDING,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyExpense',
        entityId: saved.id,
        record: bilty.code,
        description: `Created bilty expense on ${bilty.code}`,
        metadata: {
          biltyId,
          expenseAccId: dto.expenseAccId,
          amount: Number(saved.amount),
        },
      },
      activity,
    );

    return this.findOne(biltyId, saved.id);
  }

  async findAll(biltyId: string, query: BiltyExpenseListQueryDto) {
    await this.ensureBilty(biltyId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.expenseAcc', 'expenseAcc')
      .where('expense.biltyId = :biltyId', { biltyId })
      .orderBy('expense.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('expense.status = :status', { status: query.status });
    }
    if (query.expenseAccId) {
      qb.andWhere('expense.expenseAccId = :expenseAccId', {
        expenseAccId: query.expenseAccId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          expense.description ILIKE :search
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

  async findOne(biltyId: string, expenseId: string) {
    return this.toResponse(await this.findByIdOrFail(biltyId, expenseId));
  }

  async update(
    biltyId: string,
    expenseId: string,
    dto: UpdateBiltyExpenseDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);
    const expense = await this.findByIdOrFail(biltyId, expenseId);

    if (expense.status !== BiltyExpenseStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING bilty expenses can be updated',
      );
    }

    if (dto.expenseAccId !== undefined) {
      await this.validateExpenseAccount(dto.expenseAccId);
      expense.expenseAccId = dto.expenseAccId;
    }
    if (dto.amount !== undefined) {
      expense.amount = this.formatAmount(dto.amount) as unknown as number;
    }
    if (dto.description !== undefined) {
      expense.description = this.nullableTrim(dto.description);
    }

    await this.expenseRepo.save(expense);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyExpense',
        entityId: expenseId,
        record: bilty.code,
        description: `Updated bilty expense on ${bilty.code}`,
        metadata: { biltyId, expenseId },
      },
      activity,
    );

    return this.findOne(biltyId, expenseId);
  }

  /**
   * Status change. On PAID, posts debit to expenseAcc (idempotent).
   */
  async changeStatus(
    biltyId: string,
    expenseId: string,
    dto: ChangeBiltyExpenseStatusDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);

    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyExpense);
      const expense = await repo.findOne({
        where: { id: expenseId, biltyId },
        relations: { expenseAcc: true, bilty: true },
      });
      if (!expense) {
        throw new NotFoundException('Bilty expense not found');
      }

      this.assertStatusTransition(expense.status, dto.status);

      expense.status = dto.status;
      await repo.save(expense);

      if (dto.status === BiltyExpenseStatus.PAID) {
        await this.postExpenseLedger(expense, bilty, manager);
      }

      return expense;
    });

    await this.activitiesService.logAction(
      {
        action:
          dto.status === BiltyExpenseStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyExpense',
        entityId: expenseId,
        record: bilty.code,
        description: `Changed bilty expense status to ${dto.status} on ${bilty.code}`,
        metadata: { biltyId, expenseId, status: dto.status },
      },
      activity,
    );

    return this.findOne(biltyId, result.id);
  }

  private async postExpenseLedger(
    expense: BiltyExpense,
    bilty: Bilty,
    manager: EntityManager,
  ) {
    const amount = Number(expense.amount);
    const desc =
      expense.description?.trim() ||
      `Bilty ${bilty.code} expense`;

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: expense.expenseAccId,
        referenceType: AccountTransactionReferenceType.BILTY_EXPENSE,
        referenceId: expense.id,
        transactionDate: bilty.issueDate,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private assertStatusTransition(
    current: BiltyExpenseStatus,
    next: BiltyExpenseStatus,
  ) {
    if (current === next) {
      throw new BadRequestException(`Expense is already ${current}`);
    }
    if (current === BiltyExpenseStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled expenses cannot change status',
      );
    }
    if (current === BiltyExpenseStatus.PAID) {
      throw new BadRequestException(
        'Paid expenses cannot change status (ledger already posted)',
      );
    }
    if (
      next !== BiltyExpenseStatus.PAID &&
      next !== BiltyExpenseStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pending expenses can only move to PAID or CANCELLED',
      );
    }
  }

  private async ensureBilty(biltyId: string): Promise<Bilty> {
    const bilty = await this.biltyRepo.findOne({ where: { id: biltyId } });
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return bilty;
  }

  private async validateExpenseAccount(expenseAccId: string) {
    const account = await this.coaRepo.findOne({
      where: { id: expenseAccId },
    });
    if (!account) {
      throw new BadRequestException('Expense account not found');
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `Expense account ${account.code} is not postable`,
      );
    }
  }

  private async findByIdOrFail(
    biltyId: string,
    expenseId: string,
  ): Promise<BiltyExpense> {
    const expense = await this.expenseRepo.findOne({
      where: { id: expenseId, biltyId },
      relations: { expenseAcc: true },
    });
    if (!expense) {
      throw new NotFoundException('Bilty expense not found');
    }
    return expense;
  }

  private formatAmount(value: number): string {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }
    return n.toFixed(2);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(expense: BiltyExpense) {
    return {
      id: expense.id,
      biltyId: expense.biltyId,
      expenseAccId: expense.expenseAccId,
      amount: Number(expense.amount).toFixed(2),
      description: expense.description,
      status: expense.status,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      expenseAcc: expense.expenseAcc
        ? {
            id: expense.expenseAcc.id,
            code: expense.expenseAcc.code,
            name: expense.expenseAcc.name,
            parentCode: expense.expenseAcc.parentCode,
            isPostable: expense.expenseAcc.isPostable,
          }
        : null,
    };
  }
}
