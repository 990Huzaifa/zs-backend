import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BiltyFreightListQueryDto,
  ChangeBiltyFreightStatusDto,
  CreateBiltyFreightDto,
  RemoveBiltyFreightProofImageDto,
  UpdateBiltyFreightDto,
} from '../auth/dto/bilty-freight.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../common/utils/public-link.util';
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
    private readonly s3Service: S3Service,
  ) {}

  /** Nested: /biltys/:biltyId/freights */
  async createForBilty(
    biltyId: string,
    dto: CreateBiltyFreightDto,
    activity?: ActivityActorContext,
  ) {
    return this.create(biltyId, dto, activity);
  }

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

    const result = await this.findOne(savedId);
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

  /** Global list — optional biltyId filter. */
  async findAll(query: BiltyFreightListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.freightRepo
      .createQueryBuilder('freight')
      .leftJoinAndSelect('freight.bilty', 'bilty')
      .leftJoinAndSelect('freight.broker', 'broker')
      .leftJoinAndSelect('freight.assetAcc', 'assetAcc')
      .leftJoinAndSelect('freight.createdByUser', 'createdByUser')
      .orderBy('freight.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.biltyId) {
      qb.andWhere('freight.biltyId = :biltyId', { biltyId: query.biltyId });
    }
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
    if (query.dateFrom) {
      qb.andWhere('freight.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('freight.paymentDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          freight.voucherNumber ILIKE :search
          OR freight.remarks ILIKE :search
          OR bilty.code ILIKE :search
          OR bilty.refNumber ILIKE :search
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

  /** Nested list — ensures bilty exists then filters. */
  async findAllForBilty(biltyId: string, query: BiltyFreightListQueryDto) {
    await this.ensureBilty(biltyId);
    return this.findAll({ ...query, biltyId });
  }

  async findOne(id: string) {
    return this.toResponse(await this.findByIdOrFail(id));
  }

  /** Unauthenticated public view by voucher number (e.g. BF000001) or UUID. */
  async findPublic(codeOrId: string) {
    return this.toResponse(await this.findByCodeOrIdOrFail(codeOrId));
  }

  async getPublicQrPng(codeOrId: string) {
    const freight = await this.findByCodeOrIdOrFail(codeOrId);
    const links = buildPublicApiLinks('bilty-freights', freight.voucherNumber);
    const buffer = await buildPublicQrPngBuffer(
      'bilty-freights',
      freight.voucherNumber,
    );
    return {
      buffer,
      filename: `${freight.voucherNumber}-qr.png`,
      voucherNumber: freight.voucherNumber,
      publicUrl: links.publicUrl,
    };
  }

  async findOneForBilty(biltyId: string, freightId: string) {
    await this.ensureBilty(biltyId);
    const freight = await this.findByIdOrFail(freightId);
    if (freight.biltyId !== biltyId) {
      throw new NotFoundException('Bilty freight not found');
    }
    return this.toResponse(freight);
  }

  async update(
    id: string,
    dto: UpdateBiltyFreightDto,
    activity?: ActivityActorContext,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyFreight);
      const freight = await repo.findOne({ where: { id } });
      if (!freight) {
        throw new NotFoundException('Bilty freight not found');
      }
      if (freight.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException('Cancelled freights cannot be updated');
      }

      const wasPaid = freight.status === VoucherStatus.PAID;
      if (wasPaid) {
        await this.clearFreightLedger(freight.id, manager);
      }

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
        await this.postFreightLedger(freight, manager);
      }
    });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: id,
        record: result.voucherNumber,
        description: `Updated bilty freight ${result.voucherNumber}`,
        metadata: { biltyId: result.biltyId },
      },
      activity,
    );
    return result;
  }

  async updateForBilty(
    biltyId: string,
    freightId: string,
    dto: UpdateBiltyFreightDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureBilty(biltyId);
    const freight = await this.findByIdOrFail(freightId);
    if (freight.biltyId !== biltyId) {
      throw new NotFoundException('Bilty freight not found');
    }
    return this.update(freightId, dto, activity);
  }

  async changeStatus(
    id: string,
    dto: ChangeBiltyFreightStatusDto,
    activity?: ActivityActorContext,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BiltyFreight);
      const freight = await repo.findOne({ where: { id } });
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

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed bilty freight ${result.voucherNumber} status to ${dto.status}`,
        metadata: { biltyId: result.biltyId, status: dto.status },
      },
      activity,
    );
    return result;
  }

  async changeStatusForBilty(
    biltyId: string,
    freightId: string,
    dto: ChangeBiltyFreightStatusDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureBilty(biltyId);
    const freight = await this.findByIdOrFail(freightId);
    if (freight.biltyId !== biltyId) {
      throw new NotFoundException('Bilty freight not found');
    }
    return this.changeStatus(freightId, dto, activity);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const freight = await this.findByIdOrFail(id);
    const proofImages = freight.proofImages ?? [];

    await this.dataSource.transaction(async (manager) => {
      if (freight.status === VoucherStatus.PAID) {
        await this.clearFreightLedger(freight.id, manager);
      }
      await manager.getRepository(BiltyFreight).delete(id);
    });

    await this.deleteS3Keys(proofImages);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: id,
        record: freight.voucherNumber,
        description: `Deleted bilty freight ${freight.voucherNumber}`,
        metadata: { biltyId: freight.biltyId, status: freight.status },
      },
      activity,
    );

    return {
      success: true,
      id,
      voucherNumber: freight.voucherNumber,
    };
  }

  async uploadProofImages(
    id: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const freight = await this.findByIdOrFail(id);
    const keys: string[] = [];

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `bilty-freights/${id}/proof/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    const current = freight.proofImages ?? [];
    freight.proofImages = [...current, ...keys];
    await this.freightRepo.save(freight);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: id,
        record: freight.voucherNumber,
        description: `Uploaded ${keys.length} proof image(s) for bilty freight ${freight.voucherNumber}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(id);
  }

  async removeProofImage(
    id: string,
    dto: RemoveBiltyFreightProofImageDto,
    activity?: ActivityActorContext,
  ) {
    const freight = await this.findByIdOrFail(id);
    const key = dto.key.trim();
    const current = freight.proofImages ?? [];
    if (!current.includes(key)) {
      throw new NotFoundException('Proof image not found');
    }

    await this.deleteS3Keys([key]);
    const next = current.filter((k) => k !== key);
    freight.proofImages = next.length ? next : null;
    await this.freightRepo.save(freight);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'BiltyFreight',
        entityId: id,
        record: freight.voucherNumber,
        description: `Removed proof image from bilty freight ${freight.voucherNumber}`,
        metadata: { key },
      },
      activity,
    );

    return this.findOne(id);
  }

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

  private async findByIdOrFail(id: string): Promise<BiltyFreight> {
    const freight = await this.freightRepo.findOne({
      where: { id },
      relations: {
        bilty: true,
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

  private async findByCodeOrIdOrFail(codeOrId: string): Promise<BiltyFreight> {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Bilty freight not found');
    }
    if (isUuid) {
      return this.findByIdOrFail(key);
    }
    const freight = await this.freightRepo.findOne({
      where: { voucherNumber: key.toUpperCase() },
      relations: {
        bilty: true,
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
    const proofImages = freight.proofImages ?? [];
    const links = buildPublicApiLinks('bilty-freights', freight.voucherNumber);
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
      paymentAmount: Number(freight.paymentAmount).toFixed(2),
      remarks: freight.remarks ?? null,
      proofImages,
      proofImageUrls: proofImages.map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      createdBy: freight.createdBy ?? null,
      status: freight.status,
      createdAt: freight.createdAt,
      updatedAt: freight.updatedAt,
      bilty: freight.bilty
        ? {
            id: freight.bilty.id,
            code: freight.bilty.code,
            refNumber: freight.bilty.refNumber ?? null,
            status: freight.bilty.status,
          }
        : null,
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
    if (value instanceof Date) return value;
    return value.slice(0, 10) as unknown as Date;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }

  private async deleteS3Keys(keys: string[]) {
    for (const key of keys) {
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // best-effort
      }
    }
  }

  private fileExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 10) {
      return fromName.toLowerCase();
    }
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }
}
