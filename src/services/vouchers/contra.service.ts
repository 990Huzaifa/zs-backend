import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ChangeContraVoucherStatusDto,
  ContraVoucherListQueryDto,
  CreateContraVoucherDto,
  UpdateContraVoucherDto,
} from '../../auth/dto/contra-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import {
  CONTRA_VOUCHER_PREFIX,
  nextSerialCode,
} from '../../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { ContraVoucher } from '../../database/entities/contra-voucher.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { TransactionsService } from '../transactions.service';

@Injectable()
export class ContraVouchersService {
  constructor(
    @InjectRepository(ContraVoucher)
    private readonly contraRepo: Repository<ContraVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateContraVoucherDto, activity?: ActivityActorContext) {
    await this.validateAccounts(dto.fromAccId, dto.toAccId);
    this.validateChequeFields(dto.paymentMethod, dto.chequeNumber, dto.chequeDate);

    const amount = this.formatAmount(dto.paymentAmount);
    const voucherNumber = await this.generateUniqueVoucherNumber();

    const saved = await this.contraRepo.save(
      this.contraRepo.create({
        voucherNumber,
        fromAccId: dto.fromAccId,
        toAccId: dto.toAccId,
        paymentMethod: dto.paymentMethod,
        chequeNumber:
          dto.paymentMethod === PaymentMethod.CHEQUE
            ? dto.chequeNumber!.trim()
            : null,
        chequeDate:
          dto.paymentMethod === PaymentMethod.CHEQUE
            ? this.toDateOnly(dto.chequeDate!)
            : null,
        paymentDate: this.toDateOnly(dto.paymentDate),
        paymentAmount: amount as unknown as number,
        remarks: this.nullableTrim(dto.remarks),
        createdBy: activity?.actor?.id ?? null,
        status: VoucherStatus.PENDING,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'ContraVoucher',
        entityId: saved.id,
        record: saved.voucherNumber,
        description: `Created contra voucher ${saved.voucherNumber}`,
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: ContraVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.contraRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.fromAcc', 'fromAcc')
      .leftJoinAndSelect('voucher.toAcc', 'toAcc')
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
    if (query.fromAccId) {
      qb.andWhere('voucher.fromAccId = :fromAccId', {
        fromAccId: query.fromAccId,
      });
    }
    if (query.toAccId) {
      qb.andWhere('voucher.toAccId = :toAccId', { toAccId: query.toAccId });
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
          OR fromAcc.name ILIKE :search
          OR fromAcc.code ILIKE :search
          OR toAcc.name ILIKE :search
          OR toAcc.code ILIKE :search
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
    dto: UpdateContraVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const voucher = await this.findByIdOrFail(id);
    if (voucher.status !== VoucherStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING contra vouchers can be updated',
      );
    }

    const nextFrom = dto.fromAccId ?? voucher.fromAccId;
    const nextTo = dto.toAccId ?? voucher.toAccId;
    if (dto.fromAccId !== undefined || dto.toAccId !== undefined) {
      await this.validateAccounts(nextFrom, nextTo);
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

    if (dto.fromAccId !== undefined) voucher.fromAccId = dto.fromAccId;
    if (dto.toAccId !== undefined) voucher.toAccId = dto.toAccId;
    if (dto.paymentMethod !== undefined) voucher.paymentMethod = dto.paymentMethod;
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

    await this.contraRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ContraVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Updated contra voucher ${voucher.voucherNumber}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  /**
   * Status change. On PAID, posts double-entry ledger hits:
   * - credit fromAcc (money out)
   * - debit toAcc (money in)
   */
  async changeStatus(
    id: string,
    dto: ChangeContraVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ContraVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          fromAcc: true,
          toAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Contra voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postContraLedger(voucher, manager);
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
        entityType: 'ContraVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed contra voucher ${result.voucherNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  private async postContraLedger(
    voucher: ContraVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const desc =
      voucher.remarks?.trim() ||
      `Contra voucher ${voucher.voucherNumber}`;

    // Source account: credit (funds leave)
    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.fromAccId,
        referenceType: AccountTransactionReferenceType.CONTRA_VOUCHER_FROM,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        creditAmount: amount,
        idempotent: true,
      },
      manager,
    );

    // Destination account: debit (funds arrive)
    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.toAccId,
        referenceType: AccountTransactionReferenceType.CONTRA_VOUCHER_TO,
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
    // PENDING → PAID | CANCELLED only
    if (
      next !== VoucherStatus.PAID &&
      next !== VoucherStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pending vouchers can only move to PAID or CANCELLED',
      );
    }
  }

  private async validateAccounts(fromAccId: string, toAccId: string) {
    if (fromAccId === toAccId) {
      throw new BadRequestException(
        'From and to accounts must be different',
      );
    }

    const [fromAcc, toAcc] = await Promise.all([
      this.coaRepo.findOne({ where: { id: fromAccId } }),
      this.coaRepo.findOne({ where: { id: toAccId } }),
    ]);

    if (!fromAcc) {
      throw new BadRequestException('From account not found');
    }
    if (!toAcc) {
      throw new BadRequestException('To account not found');
    }
    if (!fromAcc.isPostable) {
      throw new BadRequestException(
        `From account ${fromAcc.code} is not postable`,
      );
    }
    if (!toAcc.isPostable) {
      throw new BadRequestException(
        `To account ${toAcc.code} is not postable`,
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

  private async findByIdOrFail(id: string): Promise<ContraVoucher> {
    const voucher = await this.contraRepo.findOne({
      where: { id },
      relations: {
        fromAcc: true,
        toAcc: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Contra voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.contraRepo,
        CONTRA_VOUCHER_PREFIX,
        'voucherNumber',
        6,
        attempt,
      );
      const existing = await this.contraRepo.findOne({
        where: { voucherNumber: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique contra voucher number',
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

  private toResponse(voucher: ContraVoucher) {
    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      fromAccId: voucher.fromAccId,
      toAccId: voucher.toAccId,
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
      fromAcc: this.toAccountSummary(voucher.fromAcc),
      toAcc: this.toAccountSummary(voucher.toAcc),
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
