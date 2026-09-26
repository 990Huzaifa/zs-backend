import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeMaintenanceVoucherStatusDto,
  CreateMaintenanceVoucherBatchDto,
  CreateMaintenanceVoucherEntryDto,
  UpdateMaintenanceVoucherDto,
  MaintenanceVoucherListQueryDto,
  RemoveMaintenanceVoucherProofImageDto,
} from '../../auth/dto/maintenance-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import { S3Service } from '../../common/s3/s3.service';
import {
  nextSerialCode,
  MAINTENANCE_VOUCHER_PREFIX,
} from '../../common/utils/serial-code.util';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../../common/utils/public-link.util';
import { COA_PARENT_CODES } from '../../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../../database/entities/chart-of-account.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { MaintenanceVoucher } from '../../database/entities/maintenance/maintenance-voucher.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../../database/entities/maintenance/purchase-order.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { TransactionsService } from '../transactions.service';
import { randomUUID } from 'crypto';

@Injectable()
export class MaintenanceVouchersService {
  constructor(
    @InjectRepository(MaintenanceVoucher)
    private readonly voucherRepo: Repository<MaintenanceVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepo: Repository<PurchaseOrder>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Batch create — PENDING = draft; PAID = insert + post ledger.
   * Vendor is taken from the approved Purchase Order (not client-supplied).
   */
  async createBatch(
    dto: CreateMaintenanceVoucherBatchDto,
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

    const resolvedPos: PurchaseOrder[] = [];

    for (let i = 0; i < dto.entries.length; i++) {
      const entry = dto.entries[i];
      try {
        const po = await this.resolveApprovedPo(entry.purchaseOrderId);
        resolvedPos.push(po);
        await this.validateAssetAccount(entry.assetAccId);
        this.validateChequeFields(
          entry.paymentMethod,
          entry.chequeNumber,
          entry.chequeDate,
          entry.chequeBank,
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
      const repo = manager.getRepository(MaintenanceVoucher);
      const ids: string[] = [];

      for (let i = 0; i < dto.entries.length; i++) {
        const entry = dto.entries[i];
        const po = resolvedPos[i];
        const voucherNumber = await this.generateUniqueVoucherNumber(repo, i);
        const row = await repo.save(
          repo.create(
            this.buildEntityPayload(entry, {
              voucherNumber,
              status: dto.status,
              createdBy,
              purchaseOrderId: po.id,
              vendorId: po.vendorId,
            }),
          ),
        );
        ids.push(row.id);

        if (dto.status === VoucherStatus.PAID) {
          await this.postMaintenanceLedger(row, manager);
        }
      }

      return ids;
    });

    const rows = await this.voucherRepo.find({
      where: { id: In(savedIds) },
      relations: {
        vendor: true,
        assetAcc: true,
        createdByUser: true,
        purchaseOrder: true,
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
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: rows[0]?.id ?? null,
        record: numbers,
        description:
          dto.status === VoucherStatus.PAID
            ? `Created and paid ${rows.length} maintenance voucher(s): ${numbers}`
            : `Created ${rows.length} maintenance voucher draft(s): ${numbers}`,
        metadata: { status: dto.status, count: rows.length, ids: savedIds },
      },
      activity,
    );

    return {
      data: await Promise.all(rows.map((row) => this.toResponse(row))),
    };
  }

  async findAll(query: MaintenanceVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.voucherRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.vendor', 'vendor')
      .leftJoinAndSelect('voucher.assetAcc', 'assetAcc')
      .leftJoinAndSelect('voucher.createdByUser', 'createdByUser')
      .leftJoinAndSelect('voucher.purchaseOrder', 'purchaseOrder')
      .orderBy('voucher.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    this.applyListFilters(qb, query);

    const [rows, total] = await qb.getManyAndCount();
    const summary = await this.buildListSummary(query);

    return {
      data: await Promise.all(rows.map((row) => this.toResponse(row))),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.findByIdOrFail(id));
  }

  async findPublic(codeOrId: string) {
    return this.toResponse(await this.findByCodeOrIdOrFail(codeOrId));
  }

  async getPublicQrPng(codeOrId: string) {
    const voucher = await this.findByCodeOrIdOrFail(codeOrId);
    const links = buildPublicApiLinks(
      'maintenance-vouchers',
      voucher.voucherNumber,
    );
    const buffer = await buildPublicQrPngBuffer(
      'maintenance-vouchers',
      voucher.voucherNumber,
    );
    return {
      buffer,
      filename: `${voucher.voucherNumber}-qr.png`,
      voucherNumber: voucher.voucherNumber,
      publicUrl: links.publicUrl,
    };
  }

  /**
   * Edit PENDING (draft) or PAID (approved).
   * PAID updates remove old ledger lines and re-post.
   * Vendor always comes from the Purchase Order — never from the client.
   */
  async update(
    id: string,
    dto: UpdateMaintenanceVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MaintenanceVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          vendor: true,
          assetAcc: true,
          createdByUser: true,
          purchaseOrder: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Maintenance voucher not found');
      }
      if (voucher.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException(
          'Cancelled maintenance vouchers cannot be updated',
        );
      }

      const wasPaid = voucher.status === VoucherStatus.PAID;
      if (wasPaid) {
        await this.clearMaintenanceLedger(voucher.id, manager);
      }

      const nextAsset = dto.assetAccId ?? voucher.assetAccId;

      if (dto.purchaseOrderId !== undefined) {
        const po = await this.resolveApprovedPo(dto.purchaseOrderId);
        voucher.purchaseOrderId = po.id;
        voucher.vendorId = po.vendorId;
      }
      if (dto.assetAccId !== undefined) {
        await this.validateAssetAccount(nextAsset);
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
      const nextChequeBank =
        dto.chequeBank !== undefined
          ? this.nullableTrim(dto.chequeBank)
          : voucher.chequeBank;

      this.validateChequeFields(
        nextMethod,
        nextChequeNumber,
        nextChequeDate,
        nextChequeBank,
      );

      if (dto.assetAccId !== undefined) voucher.assetAccId = dto.assetAccId;
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
        voucher.chequeBank = nextChequeBank;
      } else {
        voucher.chequeNumber = null;
        voucher.chequeDate = null;
        voucher.chequeBank = null;
      }

      await repo.save(voucher);

      if (wasPaid) {
        await this.postMaintenanceLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: id,
        record: updated.voucherNumber,
        description: `Updated maintenance voucher ${updated.voucherNumber}`,
        metadata: { status: updated.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeMaintenanceVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MaintenanceVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          vendor: true,
          assetAcc: true,
          createdByUser: true,
          purchaseOrder: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Maintenance voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postMaintenanceLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed maintenance voucher ${result.voucherNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  /** Hard delete — removes ledger lines if PAID, then deletes the row. */
  async remove(id: string, activity?: ActivityActorContext) {
    const voucher = await this.findByIdOrFail(id);
    const proofImages = voucher.proofImages ?? [];

    await this.dataSource.transaction(async (manager) => {
      if (voucher.status === VoucherStatus.PAID) {
        await this.clearMaintenanceLedger(voucher.id, manager);
      }
      await manager.getRepository(MaintenanceVoucher).delete(id);
    });

    await this.deleteS3Keys(proofImages);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Deleted maintenance voucher ${voucher.voucherNumber}`,
        metadata: { status: voucher.status },
      },
      activity,
    );

    return { success: true, id, voucherNumber: voucher.voucherNumber };
  }

  async uploadProofImages(
    id: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const voucher = await this.findByIdOrFail(id);
    const keys: string[] = [];

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `maintenance-vouchers/${id}/proof/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    const current = voucher.proofImages ?? [];
    voucher.proofImages = [...current, ...keys];
    await this.voucherRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Uploaded ${keys.length} proof image(s) for maintenance voucher ${voucher.voucherNumber}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(id);
  }

  async removeProofImage(
    id: string,
    dto: RemoveMaintenanceVoucherProofImageDto,
    activity?: ActivityActorContext,
  ) {
    const voucher = await this.findByIdOrFail(id);
    const key = dto.key.trim();
    const current = voucher.proofImages ?? [];
    if (!current.includes(key)) {
      throw new NotFoundException('Proof image not found');
    }

    await this.deleteS3Keys([key]);
    const next = current.filter((k) => k !== key);
    voucher.proofImages = next.length ? next : null;
    await this.voucherRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Removed proof image from maintenance voucher ${voucher.voucherNumber}`,
        metadata: { key },
      },
      activity,
    );

    return this.findOne(id);
  }

  private buildEntityPayload(
    entry: CreateMaintenanceVoucherEntryDto,
    meta: {
      voucherNumber: string;
      status: VoucherStatus;
      createdBy: string | null;
      purchaseOrderId: string;
      vendorId: string;
    },
  ): Partial<MaintenanceVoucher> {
    return {
      voucherNumber: meta.voucherNumber,
      purchaseOrderId: meta.purchaseOrderId,
      vendorId: meta.vendorId,
      assetAccId: entry.assetAccId,
      paymentMethod: entry.paymentMethod,
      chequeNumber:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? entry.chequeNumber!.trim()
          : null,
      chequeDate:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? this.toDateOnly(entry.chequeDate!)
          : null,
      chequeBank:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? entry.chequeBank!.trim()
          : null,
      paymentDate: this.toDateOnly(entry.paymentDate),
      paymentAmount: this.formatAmount(
        entry.paymentAmount,
      ) as unknown as number,
      remarks: this.nullableTrim(entry.remarks),
      proofImages: null,
      createdBy: meta.createdBy,
      status: meta.status,
    };
  }

  /**
   * Payment: credit asset (out), debit vendor party account
   * (resolved from vendorId under VENDOR_PAYABLES).
   */
  private async postMaintenanceLedger(
    voucher: MaintenanceVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const partyAcc = await this.resolveVendorPartyAccount(
      voucher.vendorId,
      manager,
    );
    const desc =
      voucher.remarks?.trim() ||
      `Maintenance voucher ${voucher.voucherNumber}`;

    if (voucher.assetAccId === partyAcc.id) {
      throw new BadRequestException(
        'Asset account cannot be the same as the vendor payable account',
      );
    }

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.assetAccId,
        referenceType:
          AccountTransactionReferenceType.MAINTENANCE_VOUCHER_ASSET,
        referenceId: voucher.id,
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
        referenceType:
          AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearMaintenanceLedger(
    voucherId: string,
    manager: EntityManager,
  ) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType:
          AccountTransactionReferenceType.MAINTENANCE_VOUCHER_ASSET,
        referenceId: voucherId,
      },
      manager,
    );
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType:
          AccountTransactionReferenceType.MAINTENANCE_VOUCHER_VENDOR,
        referenceId: voucherId,
      },
      manager,
    );
  }

  /** Resolve PARTY_PAYABLE leaf for vendor (by display name under 2-1-1-1). */
  private async resolveVendorPartyAccount(
    vendorId: string,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
    const vendorRepo = manager
      ? manager.getRepository(Vendor)
      : this.vendorRepo;
    const vendor = await vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      throw new BadRequestException('Vendor not found');
    }

    const displayName =
      vendor.vendorName?.trim() || vendor.ownerName.trim();

    return this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.VENDOR_PAYABLES,
      displayName,
      displayName,
      ChartOfAccountKind.PARTY_PAYABLE,
      manager,
    );
  }

  /**
   * Load PO and require APPROVED status. Vendor is taken from the PO.
   */
  private async resolveApprovedPo(
    purchaseOrderId: string,
  ): Promise<PurchaseOrder> {
    const po = await this.purchaseOrderRepo.findOne({
      where: { id: purchaseOrderId },
    });
    if (!po) {
      throw new BadRequestException('Purchase order not found');
    }
    if (po.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'Purchase order must be APPROVED',
      );
    }
    return po;
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

  private async buildListSummary(query: MaintenanceVoucherListQueryDto) {
    const qb = this.voucherRepo
      .createQueryBuilder('voucher')
      .leftJoin('voucher.vendor', 'vendor')
      .leftJoin('voucher.assetAcc', 'assetAcc')
      .leftJoin('voucher.purchaseOrder', 'purchaseOrder');

    this.applyListFilters(qb, query, { ignoreStatus: true });

    qb.select(
      `COALESCE(SUM(CASE WHEN voucher.status = :pending THEN 1 ELSE 0 END), 0)`,
      'pendingCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN voucher.status = :paid THEN 1 ELSE 0 END), 0)`,
        'paidCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN voucher.status IN (:...activeStatuses) THEN 1 ELSE 0 END), 0)`,
        'totalCount',
      )
      .setParameter('pending', VoucherStatus.PENDING)
      .setParameter('paid', VoucherStatus.PAID)
      .setParameter('activeStatuses', [
        VoucherStatus.PENDING,
        VoucherStatus.PAID,
      ]);

    const raw = await qb.getRawOne<{
      pendingCount: string;
      paidCount: string;
      totalCount: string;
    }>();

    return {
      pendingCount: Number(raw?.pendingCount ?? 0),
      paidCount: Number(raw?.paidCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<MaintenanceVoucher>,
    query: MaintenanceVoucherListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('voucher.status = :status', { status: query.status });
    }
    if (query.paymentMethod) {
      qb.andWhere('voucher.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.purchaseOrderId) {
      qb.andWhere('voucher.purchaseOrderId = :purchaseOrderId', {
        purchaseOrderId: query.purchaseOrderId,
      });
    }
    if (query.vendorId) {
      qb.andWhere('voucher.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.assetAccId) {
      qb.andWhere('voucher.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
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
          OR voucher.chequeBank ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
          OR assetAcc.name ILIKE :search
          OR assetAcc.code ILIKE :search
          OR purchaseOrder.purchaseOrderNo ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private async findByIdOrFail(id: string): Promise<MaintenanceVoucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        assetAcc: true,
        createdByUser: true,
        purchaseOrder: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Maintenance voucher not found');
    }
    return voucher;
  }

  private async findByCodeOrIdOrFail(
    codeOrId: string,
  ): Promise<MaintenanceVoucher> {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Maintenance voucher not found');
    }
    if (isUuid) {
      return this.findByIdOrFail(key);
    }
    const voucher = await this.voucherRepo.findOne({
      where: { voucherNumber: key.toUpperCase() },
      relations: {
        vendor: true,
        assetAcc: true,
        createdByUser: true,
        purchaseOrder: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Maintenance voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<MaintenanceVoucher> = this.voucherRepo,
    skipBase: number = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        MAINTENANCE_VOUCHER_PREFIX,
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
      'Could not generate unique maintenance voucher number',
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

  private async toResponse(voucher: MaintenanceVoucher) {
    let vendorAcc: ChartOfAccount | null = null;
    try {
      if (voucher.vendorId) {
        vendorAcc = await this.resolveVendorPartyAccount(voucher.vendorId);
      }
    } catch {
      vendorAcc = null;
    }

    const proofImages = voucher.proofImages ?? [];
    const links = buildPublicApiLinks(
      'maintenance-vouchers',
      voucher.voucherNumber,
    );
    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      purchaseOrderId: voucher.purchaseOrderId,
      vendorId: voucher.vendorId,
      assetAccId: voucher.assetAccId,
      vendorAccId: vendorAcc?.id ?? null,
      paymentMethod: voucher.paymentMethod,
      chequeNumber: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      chequeBank: voucher.chequeBank,
      paymentDate: voucher.paymentDate,
      paymentAmount: Number(voucher.paymentAmount).toFixed(2),
      remarks: voucher.remarks,
      proofImages,
      proofImageUrls: proofImages.map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      createdBy: voucher.createdBy,
      status: voucher.status,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
      purchaseOrder: voucher.purchaseOrder
        ? {
            id: voucher.purchaseOrder.id,
            purchaseOrderNo: voucher.purchaseOrder.purchaseOrderNo,
            status: voucher.purchaseOrder.status,
            grandTotal: Number(voucher.purchaseOrder.grandTotal),
            vendorId: voucher.purchaseOrder.vendorId,
          }
        : null,
      vendor: voucher.vendor
        ? {
            id: voucher.vendor.id,
            vendorName: voucher.vendor.vendorName,
            ownerName: voucher.vendor.ownerName,
            status: voucher.vendor.status,
          }
        : null,
      assetAcc: this.toAccountSummary(voucher.assetAcc),
      vendorAcc: this.toAccountSummary(vendorAcc),
      createdByUser: voucher.createdByUser
        ? {
            id: voucher.createdByUser.id,
            name: voucher.createdByUser.name,
            email: voucher.createdByUser.email,
          }
        : null,
    };
  }

  private async deleteS3Keys(keys: string[]) {
    for (const key of keys) {
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // continue
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
    return '';
  }
}
