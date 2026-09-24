import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ChangeVendorVoucherStatusDto,
  CreateVendorVoucherBatchDto,
  CreateVendorVoucherEntryDto,
  UpdateVendorVoucherDto,
  VendorVoucherListQueryDto,
} from '../../auth/dto/vendor-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import {
  nextSerialCode,
  VENDOR_VOUCHER_PREFIX,
} from '../../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import {
  Vendor,
  VendorStatus,
} from '../../database/entities/vendor.entity';
import { VendorVoucher } from '../../database/entities/vendor-voucher.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { TransactionsService } from '../transactions.service';

@Injectable()
export class VendorVouchersService {
  constructor(
    @InjectRepository(VendorVoucher)
    private readonly voucherRepo: Repository<VendorVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Batch create — PENDING = draft; PAID = insert + post ledger.
   */
  async createBatch(
    dto: CreateVendorVoucherBatchDto,
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
        await this.validateVendor(entry.vendorId);
        await this.validateAccounts(entry.assetAccId, entry.vendorAccId);
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
      const repo = manager.getRepository(VendorVoucher);
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
          await this.postVendorLedger(row, manager);
        }
      }

      return ids;
    });

    const rows = await this.voucherRepo.find({
      where: { id: In(savedIds) },
      relations: {
        vendor: true,
        assetAcc: true,
        vendorAcc: true,
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
        entityType: 'VendorVoucher',
        entityId: rows[0]?.id ?? null,
        record: numbers,
        description:
          dto.status === VoucherStatus.PAID
            ? `Created and paid ${rows.length} vendor voucher(s): ${numbers}`
            : `Created ${rows.length} vendor voucher draft(s): ${numbers}`,
        metadata: { status: dto.status, count: rows.length, ids: savedIds },
      },
      activity,
    );

    return { data: rows.map((row) => this.toResponse(row)) };
  }

  async findAll(query: VendorVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.voucherRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.vendor', 'vendor')
      .leftJoinAndSelect('voucher.assetAcc', 'assetAcc')
      .leftJoinAndSelect('voucher.vendorAcc', 'vendorAcc')
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
    if (query.vendorId) {
      qb.andWhere('voucher.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.assetAccId) {
      qb.andWhere('voucher.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
      });
    }
    if (query.vendorAccId) {
      qb.andWhere('voucher.vendorAccId = :vendorAccId', {
        vendorAccId: query.vendorAccId,
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
          OR vendorAcc.name ILIKE :search
          OR vendorAcc.code ILIKE :search
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
    dto: UpdateVendorVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(VendorVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          vendor: true,
          assetAcc: true,
          vendorAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Vendor voucher not found');
      }
      if (voucher.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException(
          'Cancelled vendor vouchers cannot be updated',
        );
      }

      const wasPaid = voucher.status === VoucherStatus.PAID;
      if (wasPaid) {
        await this.clearVendorLedger(voucher.id, manager);
      }

      const nextAsset = dto.assetAccId ?? voucher.assetAccId;
      const nextVendorAcc = dto.vendorAccId ?? voucher.vendorAccId;

      if (dto.vendorId !== undefined) {
        await this.validateVendor(dto.vendorId);
      }
      if (
        dto.assetAccId !== undefined ||
        dto.vendorAccId !== undefined
      ) {
        await this.validateAccounts(nextAsset, nextVendorAcc);
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

      if (dto.vendorId !== undefined) voucher.vendorId = dto.vendorId;
      if (dto.assetAccId !== undefined) voucher.assetAccId = dto.assetAccId;
      if (dto.vendorAccId !== undefined) voucher.vendorAccId = dto.vendorAccId;
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
        await this.postVendorLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorVoucher',
        entityId: id,
        record: updated.voucherNumber,
        description: `Updated vendor voucher ${updated.voucherNumber}`,
        metadata: { status: updated.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVendorVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(VendorVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          vendor: true,
          assetAcc: true,
          vendorAcc: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Vendor voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postVendorLedger(voucher, manager);
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
        entityType: 'VendorVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed vendor voucher ${result.voucherNumber} status to ${dto.status}`,
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
        await this.clearVendorLedger(voucher.id, manager);
      }
      await manager.getRepository(VendorVoucher).delete(id);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Deleted vendor voucher ${voucher.voucherNumber}`,
        metadata: { status: voucher.status },
      },
      activity,
    );

    return { success: true, id, voucherNumber: voucher.voucherNumber };
  }

  private buildEntityPayload(
    entry: CreateVendorVoucherEntryDto,
    meta: {
      voucherNumber: string;
      status: VoucherStatus;
      createdBy: string | null;
    },
  ): Partial<VendorVoucher> {
    return {
      voucherNumber: meta.voucherNumber,
      vendorId: entry.vendorId,
      assetAccId: entry.assetAccId,
      vendorAccId: entry.vendorAccId,
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
      createdBy: meta.createdBy,
      status: meta.status,
    };
  }

  /** Payment: credit asset (out), debit vendor party account. */
  private async postVendorLedger(
    voucher: VendorVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const desc =
      voucher.remarks?.trim() ||
      `Vendor voucher ${voucher.voucherNumber}`;

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.assetAccId,
        referenceType: AccountTransactionReferenceType.VENDOR_VOUCHER_ASSET,
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
        chartOfAccountId: voucher.vendorAccId,
        referenceType: AccountTransactionReferenceType.VENDOR_VOUCHER_VENDOR,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearVendorLedger(voucherId: string, manager: EntityManager) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.VENDOR_VOUCHER_ASSET,
        referenceId: voucherId,
      },
      manager,
    );
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.VENDOR_VOUCHER_VENDOR,
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

  private async validateVendor(vendorId: string) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      throw new BadRequestException('Vendor not found');
    }
    if (
      vendor.status === VendorStatus.INACTIVE ||
      vendor.status === VendorStatus.BLOCKED
    ) {
      throw new BadRequestException(`Vendor is ${vendor.status.toLowerCase()}`);
    }
  }

  private async validateAccounts(assetAccId: string, vendorAccId: string) {
    if (assetAccId === vendorAccId) {
      throw new BadRequestException(
        'Asset and vendor accounts must be different',
      );
    }

    const [assetAcc, vendorAcc] = await Promise.all([
      this.coaRepo.findOne({ where: { id: assetAccId } }),
      this.coaRepo.findOne({ where: { id: vendorAccId } }),
    ]);

    if (!assetAcc) {
      throw new BadRequestException('Asset account not found');
    }
    if (!vendorAcc) {
      throw new BadRequestException('Vendor account not found');
    }
    if (!assetAcc.isPostable) {
      throw new BadRequestException(
        `Asset account ${assetAcc.code} is not postable`,
      );
    }
    if (!vendorAcc.isPostable) {
      throw new BadRequestException(
        `Vendor account ${vendorAcc.code} is not postable`,
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

  private async findByIdOrFail(id: string): Promise<VendorVoucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        assetAcc: true,
        vendorAcc: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Vendor voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<VendorVoucher> = this.voucherRepo,
    skipBase: number = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        VENDOR_VOUCHER_PREFIX,
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
      'Could not generate unique vendor voucher number',
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

  private toResponse(voucher: VendorVoucher) {
    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      vendorId: voucher.vendorId,
      assetAccId: voucher.assetAccId,
      vendorAccId: voucher.vendorAccId,
      paymentMethod: voucher.paymentMethod,
      chequeNumber: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      chequeBank: voucher.chequeBank,
      paymentDate: voucher.paymentDate,
      paymentAmount: Number(voucher.paymentAmount).toFixed(2),
      remarks: voucher.remarks,
      createdBy: voucher.createdBy,
      status: voucher.status,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
      vendor: voucher.vendor
        ? {
            id: voucher.vendor.id,
            vendorName: voucher.vendor.vendorName,
            ownerName: voucher.vendor.ownerName,
            status: voucher.vendor.status,
          }
        : null,
      assetAcc: this.toAccountSummary(voucher.assetAcc),
      vendorAcc: this.toAccountSummary(voucher.vendorAcc),
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
