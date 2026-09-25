import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BiltyFreightListQueryDto,
  ChangeBiltyFreightStatusDto,
  CreateBiltyFreightDto,
  UpdateBiltyFreightDto,
} from '../auth/dto/bilty.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  BILTY_FREIGHT_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Bilty,
  BiltyFreight,
  BiltyFreightVoucherType,
} from '../database/entities/bilty.entity';
import { Broker } from '../database/entities/broker.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { AccountTransactionReferenceType } from '../database/entities/transaction.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../database/entities/voucher.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { TransactionsService } from './transactions.service';

@Injectable()
export class BiltyFreightsService {
  constructor(
    @InjectRepository(BiltyFreight)
    private readonly freightRepo: Repository<BiltyFreight>,
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(Broker)
    private readonly brokerRepo: Repository<Broker>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    biltyId: string,
    dto: CreateBiltyFreightDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);
    const brokerId = dto.brokerId ?? bilty.brokerId ?? null;
    if (!brokerId) {
      throw new BadRequestException(
        'brokerId is required (bilty has no default broker)',
      );
    }
    await this.ensureBroker(brokerId);
    await this.validateAssetAccount(dto.assetAccId);
    this.validateChequeFields(
      dto.paymentMethod,
      dto.chequeNumber,
      dto.chequeDate,
      dto.chequeBank,
    );

    const status = dto.status ?? VoucherStatus.PENDING;
    if (status !== VoucherStatus.PENDING && status !== VoucherStatus.PAID) {
      throw new BadRequestException('Create status must be PENDING or PAID');
    }

    const createdBy = activity?.actor?.id ?? null;

    const savedId = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyFreight);
      const voucherNumber = await this.generateUniqueVoucherNumber(repo);
      const row = await repo.save(
        repo.create({
          voucherNumber,
          biltyId,
          brokerId,
          assetAccId: dto.assetAccId,
          voucherType: dto.voucherType,
          paymentMethod: dto.paymentMethod,
          chequeNumber:
            dto.paymentMethod === PaymentMethod.CHEQUE
              ? dto.chequeNumber!.trim()
              : null,
          chequeDate:
            dto.paymentMethod === PaymentMethod.CHEQUE
              ? this.toDateOnly(dto.chequeDate!)
              : null,
          chequeBank:
            dto.paymentMethod === PaymentMethod.CHEQUE
              ? dto.chequeBank!.trim()
              : null,
          paymentDate: this.toDateOnly(dto.paymentDate),
          paymentAmount: this.formatAmount(
            dto.paymentAmount,
          ) as unknown as number,
          remarks: this.nullableTrim(dto.remarks),
          proofImages: null,
          createdBy,
          status,
        }),
      );

      if (status === VoucherStatus.PAID) {
        await this.postFreightLedger(row, manager);
      }

      return row.id;
    });

    const result = await this.findOne(biltyId, savedId);
    await this.activitiesService.logAction(
      {
        action:
          status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: savedId,
        record: result.voucherNumber,
        description:
          status === VoucherStatus.PAID
            ? `Created and paid bilty freight ${result.voucherNumber} on ${bilty.code}`
            : `Created bilty freight draft ${result.voucherNumber} on ${bilty.code}`,
        metadata: {
          biltyId,
          brokerId,
          voucherType: dto.voucherType,
          status,
        },
      },
      activity,
    );
    return result;
  }

  async findAll(biltyId: string, query: BiltyFreightListQueryDto) {
    await this.ensureBilty(biltyId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.freightRepo
      .createQueryBuilder('freight')
      .leftJoinAndSelect('freight.broker', 'broker')
      .leftJoinAndSelect('freight.assetAcc', 'assetAcc')
      .leftJoinAndSelect('freight.createdByUser', 'createdByUser')
      .where('freight.biltyId = :biltyId', { biltyId })
      .orderBy('freight.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('freight.status = :status', { status: query.status });
    }
    if (query.voucherType) {
      qb.andWhere('freight.voucherType = :voucherType', {
        voucherType: query.voucherType,
      });
    }
    if (query.brokerId) {
      qb.andWhere('freight.brokerId = :brokerId', { brokerId: query.brokerId });
    }
    if (query.assetAccId) {
      qb.andWhere('freight.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          freight.voucherNumber ILIKE :search
          OR freight.remarks ILIKE :search
          OR broker.companyName ILIKE :search
          OR assetAcc.name ILIKE :search
          OR assetAcc.code ILIKE :search
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

  async findOne(biltyId: string, freightId: string) {
    return this.toResponse(await this.findByIdOrFail(biltyId, freightId));
  }

  async update(
    biltyId: string,
    freightId: string,
    dto: UpdateBiltyFreightDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyFreight);
      const freight = await repo.findOne({
        where: { id: freightId, biltyId },
      });
      if (!freight) {
        throw new NotFoundException('Bilty freight not found');
      }
      if (freight.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException('Cancelled freights cannot be updated');
      }

      const wasPaid = freight.status === VoucherStatus.PAID;

      if (dto.brokerId !== undefined) {
        await this.ensureBroker(dto.brokerId);
        freight.brokerId = dto.brokerId;
      }
      if (dto.assetAccId !== undefined) {
        await this.validateAssetAccount(dto.assetAccId);
        freight.assetAccId = dto.assetAccId;
      }
      if (dto.voucherType !== undefined) {
        freight.voucherType = dto.voucherType;
      }

      const nextMethod = dto.paymentMethod ?? freight.paymentMethod;
      const nextChequeNumber =
        dto.chequeNumber !== undefined
          ? this.nullableTrim(dto.chequeNumber)
          : freight.chequeNumber;
      const nextChequeDate =
        dto.chequeDate !== undefined
          ? dto.chequeDate
            ? this.toDateOnly(dto.chequeDate)
            : null
          : freight.chequeDate;
      const nextChequeBank =
        dto.chequeBank !== undefined
          ? this.nullableTrim(dto.chequeBank)
          : freight.chequeBank;

      this.validateChequeFields(
        nextMethod,
        nextChequeNumber,
        nextChequeDate,
        nextChequeBank,
      );

      if (dto.paymentMethod !== undefined) {
        freight.paymentMethod = dto.paymentMethod;
      }
      freight.chequeNumber =
        nextMethod === PaymentMethod.CHEQUE ? nextChequeNumber : null;
      freight.chequeDate =
        nextMethod === PaymentMethod.CHEQUE ? nextChequeDate : null;
      freight.chequeBank =
        nextMethod === PaymentMethod.CHEQUE ? nextChequeBank : null;

      if (dto.paymentDate !== undefined) {
        freight.paymentDate = this.toDateOnly(dto.paymentDate);
      }
      if (dto.paymentAmount !== undefined) {
        freight.paymentAmount = this.formatAmount(
          dto.paymentAmount,
        ) as unknown as number;
      }
      if (dto.remarks !== undefined) {
        freight.remarks = this.nullableTrim(dto.remarks);
      }

      await repo.save(freight);

      if (wasPaid) {
        await this.clearFreightLedger(freight.id, manager);
        await this.postFreightLedger(freight, manager);
      }
    });

    const result = await this.findOne(biltyId, freightId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: freightId,
        record: result.voucherNumber,
        description: `Updated bilty freight ${result.voucherNumber} on ${bilty.code}`,
        metadata: { biltyId, freightId },
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    biltyId: string,
    freightId: string,
    dto: ChangeBiltyFreightStatusDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.ensureBilty(biltyId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyFreight);
      const freight = await repo.findOne({
        where: { id: freightId, biltyId },
      });
      if (!freight) {
        throw new NotFoundException('Bilty freight not found');
      }

      this.assertStatusTransition(freight.status, dto.status);
      freight.status = dto.status;
      await repo.save(freight);

      if (dto.status === VoucherStatus.PAID) {
        await this.postFreightLedger(freight, manager);
      }
    });

    const result = await this.findOne(biltyId, freightId);
    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: freightId,
        record: result.voucherNumber,
        description: `Changed bilty freight ${result.voucherNumber} status to ${dto.status} on ${bilty.code}`,
        metadata: { biltyId, freightId, status: dto.status },
      },
      activity,
    );
    return result;
  }

  /**
   * PAYABLE: credit asset (out), debit broker payable.
   * RECEIVABLE: debit asset (in), credit broker receivable.
   */
  private async postFreightLedger(
    freight: BiltyFreight,
    manager: EntityManager,
  ) {
    const amount = Number(freight.paymentAmount);
    const date = freight.paymentDate;
    const partyAcc = await this.resolveBrokerPartyAccount(
      freight.brokerId,
      freight.voucherType,
      manager,
    );
    const desc =
      freight.remarks?.trim() ||
      `Bilty freight ${freight.voucherNumber}`;

    if (freight.assetAccId === partyAcc.id) {
      throw new BadRequestException(
        'Asset account cannot be the same as the broker party account',
      );
    }

    if (freight.voucherType === BiltyFreightVoucherType.PAYABLE) {
      await this.transactionsService.postEntry(
        {
          chartOfAccountId: freight.assetAccId,
          referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_ASSET,
          referenceId: freight.id,
          transactionDate: date,
          description: desc,
          creditAmount: amount,
          idempotent: true,
        },
        manager,
      );
      await this.transactionsService.postEntry(
        {
          chartOfAccountId: partyAcc.id,
          referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_BROKER,
          referenceId: freight.id,
          transactionDate: date,
          description: desc,
          debitAmount: amount,
          idempotent: true,
        },
        manager,
      );
      return;
    }

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: freight.assetAccId,
        referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_ASSET,
        referenceId: freight.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );
    await this.transactionsService.postEntry(
      {
        chartOfAccountId: partyAcc.id,
        referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_BROKER,
        referenceId: freight.id,
        transactionDate: date,
        description: desc,
        creditAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearFreightLedger(
    freightId: string,
    manager: EntityManager,
  ) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_ASSET,
        referenceId: freightId,
      },
      manager,
    );
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.BILTY_FREIGHT_BROKER,
        referenceId: freightId,
      },
      manager,
    );
  }

  private async resolveBrokerPartyAccount(
    brokerId: string,
    voucherType: BiltyFreightVoucherType,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
    const brokerRepo = manager
      ? manager.getRepository(Broker)
      : this.brokerRepo;
    const broker = await brokerRepo.findOne({ where: { id: brokerId } });
    if (!broker) {
      throw new BadRequestException('Broker not found');
    }

    const isPayable = voucherType === BiltyFreightVoucherType.PAYABLE;
    return this.chartOfAccountsService.syncLinkedLeafName(
      isPayable
        ? COA_PARENT_CODES.BROKER_PAYABLES
        : COA_PARENT_CODES.BROKER_RECEIVABLES,
      broker.companyName,
      broker.companyName,
      isPayable
        ? ChartOfAccountKind.PARTY_PAYABLE
        : ChartOfAccountKind.PARTY_RECEIVABLE,
      manager,
    );
  }

  private assertStatusTransition(current: VoucherStatus, next: VoucherStatus) {
    if (current === next) {
      throw new BadRequestException(`Freight is already ${current}`);
    }
    if (current === VoucherStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled freights cannot change status',
      );
    }
    if (current === VoucherStatus.PAID) {
      throw new BadRequestException(
        'Paid freights cannot change status (ledger already posted)',
      );
    }
    if (next !== VoucherStatus.PAID && next !== VoucherStatus.CANCELLED) {
      throw new BadRequestException(
        'Pending freights can only move to PAID or CANCELLED',
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

  private async ensureBroker(brokerId: string) {
    const exists = await this.brokerRepo.exist({ where: { id: brokerId } });
    if (!exists) {
      throw new BadRequestException('Broker not found');
    }
  }

  private async validateAssetAccount(assetAccId: string) {
    const assetAcc = await this.coaRepo.findOne({ where: { id: assetAccId } });
    if (!assetAcc) {
      throw new BadRequestException('Asset account not found');
    }
    if (!assetAcc.isPostable) {
      throw new BadRequestException(
        `Asset account ${assetAcc.code} is not postable`,
      );
    }
  }

  private validateChequeFields(
    method: PaymentMethod,
    chequeNumber?: string | null,
    chequeDate?: string | Date | null,
    chequeBank?: string | null,
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
    if (!chequeBank?.toString().trim()) {
      throw new BadRequestException(
        'chequeBank is required for CHEQUE payments',
      );
    }
  }

  private async findByIdOrFail(
    biltyId: string,
    freightId: string,
  ): Promise<BiltyFreight> {
    const freight = await this.freightRepo.findOne({
      where: { id: freightId, biltyId },
      relations: {
        broker: true,
        assetAcc: true,
        createdByUser: true,
      },
    });
    if (!freight) {
      throw new NotFoundException('Bilty freight not found');
    }
    return freight;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<BiltyFreight> = this.freightRepo,
    skipBase = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        BILTY_FREIGHT_PREFIX,
        'voucherNumber',
        6,
        skipBase + attempt,
      );
      const existing = await repo.findOne({ where: { voucherNumber: code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique voucher number');
  }

  private toResponse(freight: BiltyFreight) {
    return {
      id: freight.id,
      voucherNumber: freight.voucherNumber,
      biltyId: freight.biltyId,
      brokerId: freight.brokerId,
      assetAccId: freight.assetAccId,
      voucherType: freight.voucherType,
      paymentMethod: freight.paymentMethod,
      chequeNumber: freight.chequeNumber ?? null,
      chequeDate: freight.chequeDate ?? null,
      chequeBank: freight.chequeBank ?? null,
      paymentDate: freight.paymentDate,
      paymentAmount: Number(freight.paymentAmount),
      remarks: freight.remarks ?? null,
      proofImages: freight.proofImages ?? [],
      createdBy: freight.createdBy ?? null,
      status: freight.status,
      createdAt: freight.createdAt,
      updatedAt: freight.updatedAt,
      broker: freight.broker
        ? {
            id: freight.broker.id,
            companyName: freight.broker.companyName,
            ownerName: freight.broker.ownerName,
            email: freight.broker.email ?? null,
            status: freight.broker.status,
          }
        : null,
      assetAcc: freight.assetAcc
        ? {
            id: freight.assetAcc.id,
            code: freight.assetAcc.code,
            name: freight.assetAcc.name,
          }
        : null,
      createdByUser: freight.createdByUser
        ? {
            id: freight.createdByUser.id,
            name: freight.createdByUser.name,
          }
        : null,
    };
  }

  private formatAmount(value: number): string {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('paymentAmount must be greater than 0');
    }
    return n.toFixed(2);
  }

  private toDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
      return value;
    }
    return value.slice(0, 10) as unknown as Date;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }
}
