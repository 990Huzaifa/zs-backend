import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ChangeClientVoucherStatusDto,
  CreateClientVoucherBatchDto,
  CreateClientVoucherEntryDto,
  ClientVoucherListQueryDto,
  UpdateClientVoucherDto,
} from '../../auth/dto/client-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import {
  CLIENT_VOUCHER_PREFIX,
  nextSerialCode,
} from '../../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import {
  Client,
  ClientStatus,
} from '../../database/entities/client.entity';
import { ClientVoucher } from '../../database/entities/client-voucher.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { TransactionsService } from '../transactions.service';

@Injectable()
export class ClientVouchersService {
  constructor(
    @InjectRepository(ClientVoucher)
    private readonly voucherRepo: Repository<ClientVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Batch create — PENDING = draft; PAID = insert + post ledger.
   */
  async createBatch(
    dto: CreateClientVoucherBatchDto,
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
        await this.validateClient(entry.clientId);
        await this.validateAccounts(entry.assetAccId, entry.clientAccId);
        this.validateChequeFields(
          entry.paymentMethod,
          entry.chequeNumber,
          entry.chequeDate,
        );
        this.formatAmount(entry.paymentAmount);
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw new BadRequestException(`entries[${i}]: ${err.message}`);
        }
        throw err;
      }
    }

    const createdBy = activity?.actor?.id ?? null;

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const ids: string[] = [];

      for (let i = 0; i < dto.entries.length; i++) {
        const entry = dto.entries[i];
        const voucherNumber = await this.generateUniqueVoucherNumber(repo, i);
        const row = await repo.save(
          repo.create(
            this.buildEntityPayload(entry, {
              voucherNumber,
              status: dto.status,
              createdBy,
            }),
          ),
        );
        ids.push(row.id);

        if (dto.status === VoucherStatus.PAID) {
          await this.postClientLedger(row, manager);
        }
      }

      return ids;
    });

    const rows = await this.voucherRepo.find({
      where: { id: In(savedIds) },
      relations: {
        client: true,
        assetAcc: true,
        clientAcc: true,
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
        entityType: 'ClientVoucher',
        entityId: rows[0]?.id ?? null,
        record: numbers,
        description:
          dto.status === VoucherStatus.PAID
            ? `Created and paid ${rows.length} client voucher(s): ${numbers}`
            : `Created ${rows.length} client voucher draft(s): ${numbers}`,
        metadata: { status: dto.status, count: rows.length, ids: savedIds },
      },
      activity,
    );

    return { data: rows.map((row) => this.toResponse(row)) };
  }

  async findAll(query: ClientVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.voucherRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.client', 'client')
      .leftJoinAndSelect('voucher.assetAcc', 'assetAcc')
      .leftJoinAndSelect('voucher.clientAcc', 'clientAcc')
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
    if (query.clientId) {
      qb.andWhere('voucher.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.assetAccId) {
      qb.andWhere('voucher.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
      });
    }
    if (query.clientAccId) {
      qb.andWhere('voucher.clientAccId = :clientAccId', {
        clientAccId: query.clientAccId,
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
          OR client.companyName ILIKE :search
          OR assetAcc.name ILIKE :search
          OR assetAcc.code ILIKE :search
          OR clientAcc.name ILIKE :search
          OR clientAcc.code ILIKE :search
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

  /**
   * Edit PENDING (draft) or PAID (approved).
   * PAID updates remove old ledger lines and re-post.
   */
  async update(
    id: string,
    dto: UpdateClientVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          client: true,
          assetAcc: true,
          clientAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Client voucher not found');
      }
      if (voucher.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException(
          'Cancelled client vouchers cannot be updated',
        );
      }

      const wasPaid = voucher.status === VoucherStatus.PAID;
      if (wasPaid) {
        await this.clearClientLedger(voucher.id, manager);
      }

      const nextAsset = dto.assetAccId ?? voucher.assetAccId;
      const nextClientAcc = dto.clientAccId ?? voucher.clientAccId;

      if (dto.clientId !== undefined) {
        await this.validateClient(dto.clientId);
      }
      if (
        dto.assetAccId !== undefined ||
        dto.clientAccId !== undefined
      ) {
        await this.validateAccounts(nextAsset, nextClientAcc);
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

      if (dto.clientId !== undefined) voucher.clientId = dto.clientId;
      if (dto.assetAccId !== undefined) voucher.assetAccId = dto.assetAccId;
      if (dto.clientAccId !== undefined) voucher.clientAccId = dto.clientAccId;
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

      await repo.save(voucher);

      if (wasPaid) {
        await this.postClientLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: updated.voucherNumber,
        description: `Updated client voucher ${updated.voucherNumber}`,
        metadata: { status: updated.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeClientVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          client: true,
          assetAcc: true,
          clientAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Client voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postClientLedger(voucher, manager);
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
        entityType: 'ClientVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed client voucher ${result.voucherNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  /** Hard delete — removes ledger lines if PAID, then deletes the row. */
  async remove(id: string, activity?: ActivityActorContext) {
    const voucher = await this.findByIdOrFail(id);

    await this.dataSource.transaction(async (manager) => {
      if (voucher.status === VoucherStatus.PAID) {
        await this.clearClientLedger(voucher.id, manager);
      }
      await manager.getRepository(ClientVoucher).delete(id);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Deleted client voucher ${voucher.voucherNumber}`,
        metadata: { status: voucher.status },
      },
      activity,
    );

    return { success: true, id, voucherNumber: voucher.voucherNumber };
  }

  private buildEntityPayload(
    entry: CreateClientVoucherEntryDto,
    meta: {
      voucherNumber: string;
      status: VoucherStatus;
      createdBy: string | null;
    },
  ): Partial<ClientVoucher> {
    return {
      voucherNumber: meta.voucherNumber,
      clientId: entry.clientId,
      assetAccId: entry.assetAccId,
      clientAccId: entry.clientAccId,
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

  /** Receipt: debit asset (in), credit client party account. */
  private async postClientLedger(
    voucher: ClientVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const desc =
      voucher.remarks?.trim() ||
      `Client voucher ${voucher.voucherNumber}`;

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.assetAccId,
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_ASSET,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.clientAccId,
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_CLIENT,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        creditAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearClientLedger(voucherId: string, manager: EntityManager) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_ASSET,
        referenceId: voucherId,
      },
      manager,
    );
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_CLIENT,
        referenceId: voucherId,
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

  private async validateClient(clientId: string) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    if (client.status === ClientStatus.INACTIVE) {
      throw new BadRequestException('Client is inactive');
    }
  }

  private async validateAccounts(assetAccId: string, clientAccId: string) {
    if (assetAccId === clientAccId) {
      throw new BadRequestException(
        'Asset and client accounts must be different',
      );
    }

    const [assetAcc, clientAcc] = await Promise.all([
      this.coaRepo.findOne({ where: { id: assetAccId } }),
      this.coaRepo.findOne({ where: { id: clientAccId } }),
    ]);

    if (!assetAcc) {
      throw new BadRequestException('Asset account not found');
    }
    if (!clientAcc) {
      throw new BadRequestException('Client account not found');
    }
    if (!assetAcc.isPostable) {
      throw new BadRequestException(
        `Asset account ${assetAcc.code} is not postable`,
      );
    }
    if (!clientAcc.isPostable) {
      throw new BadRequestException(
        `Client account ${clientAcc.code} is not postable`,
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

  private async findByIdOrFail(id: string): Promise<ClientVoucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { id },
      relations: {
        client: true,
        assetAcc: true,
        clientAcc: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Client voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<ClientVoucher> = this.voucherRepo,
    skipBase: number = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        CLIENT_VOUCHER_PREFIX,
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
      'Could not generate unique client voucher number',
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

  private toResponse(voucher: ClientVoucher) {
    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      clientId: voucher.clientId,
      assetAccId: voucher.assetAccId,
      clientAccId: voucher.clientAccId,
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
      client: voucher.client
        ? {
            id: voucher.client.id,
            companyName: voucher.client.companyName,
            email: voucher.client.email,
            status: voucher.client.status,
          }
        : null,
      assetAcc: this.toAccountSummary(voucher.assetAcc),
      clientAcc: this.toAccountSummary(voucher.clientAcc),
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
