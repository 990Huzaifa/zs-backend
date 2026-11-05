import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  CreateVendorInvoiceDto,
  UpdateVendorInvoiceDto,
  VendorInvoiceListQueryDto,
} from '../auth/dto/vendor-invoice.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  nextSerialCode,
  VENDOR_INVOICE_PREFIX,
  VOUCHER_CODE_PAD,
} from '../common/utils/serial-code.util';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import {
  AccountTransactionReferenceType,
  EntryType,
  Transaction,
} from '../database/entities/transaction.entity';
import {
  VendorInvoice,
  VendorInvoiceItem,
  VendorInvoiceStatus,
} from '../database/entities/vendor/vendor-invoice.entity';
import {
  Vendor,
  VendorStatus,
} from '../database/entities/vendor/vendor.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { TransactionsService } from './transactions.service';

@Injectable()
export class VendorInvoicesService {
  constructor(
    @InjectRepository(VendorInvoice)
    private readonly invoiceRepo: Repository<VendorInvoice>,
    @InjectRepository(VendorInvoiceItem)
    private readonly itemRepo: Repository<VendorInvoiceItem>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(dto: CreateVendorInvoiceDto, activity?: ActivityActorContext) {
    await this.ensureVendor(dto.vendorId);
    const transactions = await this.resolveLinkableTransactions(
      dto.transactionIds,
    );
    const totalAmount = this.sumTransactionAmounts(transactions);
    if (totalAmount <= 0) {
      throw new BadRequestException(
        'Linked transactions must have a positive amount',
      );
    }

    const invoiceNumber = await this.generateUniqueInvoiceNumber();

    const savedId = await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(VendorInvoice, {
          vendorId: dto.vendorId,
          invoiceNumber,
          invoiceDate: this.toDateOnly(dto.invoiceDate),
          description: this.nullableTrim(dto.description),
          remarks: this.nullableTrim(dto.remarks),
          totalAmount: totalAmount.toFixed(2) as unknown as number,
          status: VendorInvoiceStatus.PENDING,
        }),
      );

      await manager.save(
        transactions.map((tx) =>
          manager.create(VendorInvoiceItem, {
            vendorInvoiceId: invoice.id,
            transactionId: tx.id,
          }),
        ),
      );

      // LEDGER_ONLY summary is posted only on approve — not on create.
      return invoice.id;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: savedId,
        record: invoiceNumber,
        description: `Created vendor invoice ${invoiceNumber}`,
        metadata: {
          vendorId: dto.vendorId,
          itemCount: transactions.length,
          totalAmount,
        },
      },
      activity,
    );

    return this.findOne(savedId);
  }

  async findAll(query: VendorInvoiceListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .orderBy('invoice.invoiceDate', 'DESC')
      .addOrderBy('invoice.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('invoice.status = :status', { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere('invoice.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.dateFrom) {
      qb.andWhere('invoice.invoiceDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('invoice.invoiceDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          invoice.invoiceNumber ILIKE :search
          OR invoice.description ILIKE :search
          OR invoice.remarks ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
          OR vendor.email ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    const summary = await this.buildListSummary(query);

    return {
      data: rows.map((row) => this.toListResponse(row)),
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
    return this.toDetailResponse(await this.findByIdOrFail(id));
  }

  async update(
    id: string,
    dto: UpdateVendorInvoiceDto,
    activity?: ActivityActorContext,
  ) {
    const invoice = await this.findByIdOrFail(id);
    this.assertEditable(invoice);

    await this.ensureVendor(invoice.vendorId);

    if (dto.invoiceDate !== undefined) {
      invoice.invoiceDate = this.toDateOnly(dto.invoiceDate);
    }
    if (dto.description !== undefined) {
      invoice.description = this.nullableTrim(dto.description);
    }
    if (dto.remarks !== undefined) {
      invoice.remarks = this.nullableTrim(dto.remarks);
    }

    await this.dataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(VendorInvoice);
      const itemRepo = manager.getRepository(VendorInvoiceItem);

      if (dto.transactionIds !== undefined) {
        const transactions = await this.resolveLinkableTransactions(
          dto.transactionIds,
          invoice.id,
        );
        const totalAmount = this.sumTransactionAmounts(transactions);
        if (totalAmount <= 0) {
          throw new BadRequestException(
            'Linked transactions must have a positive amount',
          );
        }

        await itemRepo.delete({ vendorInvoiceId: invoice.id });
        await itemRepo.save(
          transactions.map((tx) =>
            itemRepo.create({
              vendorInvoiceId: invoice.id,
              transactionId: tx.id,
            }),
          ),
        );
        invoice.totalAmount = totalAmount.toFixed(2) as unknown as number;
      }

      await invoiceRepo.save(invoice);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: invoice.id,
        record: invoice.invoiceNumber,
        description: `Updated vendor invoice ${invoice.invoiceNumber}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  /** PENDING → APPROVED: posts LEDGER_ONLY vendor ledger summary row. */
  async approve(id: string, activity?: ActivityActorContext) {
    const invoice = await this.findByIdOrFail(id);
    if (invoice.status === VendorInvoiceStatus.APPROVED) {
      return this.toDetailResponse(invoice);
    }
    if (invoice.status !== VendorInvoiceStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve ${invoice.status} invoice`,
      );
    }
    if (!invoice.items?.length) {
      throw new BadRequestException(
        'Vendor invoice must have at least one linked transaction',
      );
    }

    const vendor = await this.ensureVendor(invoice.vendorId);

    await this.dataSource.transaction(async (manager) => {
      invoice.status = VendorInvoiceStatus.APPROVED;
      await manager.getRepository(VendorInvoice).save(invoice);
      await this.postInvoiceSummaryLedger(invoice, vendor, manager);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: invoice.id,
        record: invoice.invoiceNumber,
        description: `Approved vendor invoice ${invoice.invoiceNumber}`,
        metadata: { status: VendorInvoiceStatus.APPROVED },
      },
      activity,
    );

    return this.findOne(id);
  }

  async markPaid(id: string, activity?: ActivityActorContext) {
    const invoice = await this.findByIdOrFail(id);
    if (invoice.status === VendorInvoiceStatus.PAID) {
      return this.toDetailResponse(invoice);
    }
    if (invoice.status !== VendorInvoiceStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved vendor invoices can be marked paid',
      );
    }

    invoice.status = VendorInvoiceStatus.PAID;
    await this.invoiceRepo.save(invoice);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: invoice.id,
        record: invoice.invoiceNumber,
        description: `Marked vendor invoice ${invoice.invoiceNumber} as paid`,
        metadata: { status: VendorInvoiceStatus.PAID },
      },
      activity,
    );

    return this.findOne(id);
  }

  async cancel(id: string, activity?: ActivityActorContext) {
    const invoice = await this.findByIdOrFail(id);
    if (invoice.status === VendorInvoiceStatus.CANCELLED) {
      return this.toDetailResponse(invoice);
    }
    if (invoice.status === VendorInvoiceStatus.PAID) {
      throw new BadRequestException('Paid vendor invoices cannot be cancelled');
    }

    await this.dataSource.transaction(async (manager) => {
      invoice.status = VendorInvoiceStatus.CANCELLED;
      await manager.getRepository(VendorInvoice).save(invoice);
      await this.clearInvoiceSummaryLedger(invoice.id, manager);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: invoice.id,
        record: invoice.invoiceNumber,
        description: `Cancelled vendor invoice ${invoice.invoiceNumber}`,
        metadata: { status: VendorInvoiceStatus.CANCELLED },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const invoice = await this.findByIdOrFail(id);
    if (
      invoice.status !== VendorInvoiceStatus.PENDING &&
      invoice.status !== VendorInvoiceStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only pending or cancelled vendor invoices can be deleted',
      );
    }

    const { invoiceNumber } = invoice;

    await this.dataSource.transaction(async (manager) => {
      await this.clearInvoiceSummaryLedger(invoice.id, manager);
      await manager.getRepository(VendorInvoice).remove(invoice);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.FINANCE,
        entityType: 'VendorInvoice',
        entityId: id,
        record: invoiceNumber,
        description: `Deleted vendor invoice ${invoiceNumber}`,
      },
      activity,
    );

    return { message: 'Vendor invoice deleted' };
  }

  private async buildListSummary(query: VendorInvoiceListQueryDto) {
    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoin('invoice.vendor', 'vendor');

    if (query.vendorId) {
      qb.andWhere('invoice.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.dateFrom) {
      qb.andWhere('invoice.invoiceDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('invoice.invoiceDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          invoice.invoiceNumber ILIKE :search
          OR invoice.description ILIKE :search
          OR invoice.remarks ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
          OR vendor.email ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    qb.select(
      `COALESCE(SUM(CASE WHEN invoice.status = :pending THEN 1 ELSE 0 END), 0)`,
      'pendingCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN invoice.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN invoice.status = :paid THEN 1 ELSE 0 END), 0)`,
        'paidCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN invoice.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(invoice.id)`, 'totalCount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN invoice.status != :cancelled THEN invoice.totalAmount ELSE 0 END), 0)`,
        'totalAmount',
      )
      .setParameter('pending', VendorInvoiceStatus.PENDING)
      .setParameter('approved', VendorInvoiceStatus.APPROVED)
      .setParameter('paid', VendorInvoiceStatus.PAID)
      .setParameter('cancelled', VendorInvoiceStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();
    return {
      pendingCount: Number(raw?.pendingCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      paidCount: Number(raw?.paidCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
      totalAmount: Number(raw?.totalAmount ?? 0),
    };
  }

  private async postInvoiceSummaryLedger(
    invoice: VendorInvoice,
    vendor: Vendor,
    manager: EntityManager,
  ) {
    const partyAcc = await this.resolveVendorPartyAccount(vendor, manager);
    const amount = Number(invoice.totalAmount);
    const displayName =
      vendor.vendorName?.trim() || vendor.ownerName.trim();

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: partyAcc.id,
        referenceType: AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY,
        referenceId: invoice.id,
        transactionDate: invoice.invoiceDate,
        description:
          invoice.description?.trim() ||
          `Vendor invoice ${invoice.invoiceNumber} — ${displayName}`,
        creditAmount: amount,
        entryType: EntryType.LEDGER_ONLY,
        showInLedger: true,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearInvoiceSummaryLedger(
    invoiceId: string,
    manager: EntityManager,
  ) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.VENDOR_INVOICE_SUMMARY,
        referenceId: invoiceId,
      },
      manager,
    );
  }

  private async resolveVendorPartyAccount(
    vendor: Vendor,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
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

  private async resolveLinkableTransactions(
    transactionIds: string[],
    excludeInvoiceId?: string,
  ): Promise<Transaction[]> {
    const uniqueIds = [...new Set(transactionIds)];
    if (uniqueIds.length !== transactionIds.length) {
      throw new BadRequestException('Duplicate transaction ids are not allowed');
    }

    const rows = await this.transactionRepo.find({
      where: { id: In(uniqueIds) },
    });
    if (rows.length !== uniqueIds.length) {
      throw new NotFoundException('One or more transactions not found');
    }

    for (const tx of rows) {
      if (tx.entryType === EntryType.LEDGER_ONLY) {
        throw new BadRequestException(
          'LEDGER_ONLY transactions cannot be linked to a vendor invoice',
        );
      }
      const amount = this.transactionAmount(tx);
      if (amount <= 0) {
        throw new BadRequestException(
          `Transaction ${tx.id} has no positive amount to bill`,
        );
      }
    }

    const itemQb = this.itemRepo
      .createQueryBuilder('item')
      .innerJoin('item.invoice', 'invoice')
      .where('item.transactionId IN (:...ids)', { ids: uniqueIds })
      .andWhere('invoice.status != :cancelled', {
        cancelled: VendorInvoiceStatus.CANCELLED,
      });

    if (excludeInvoiceId) {
      itemQb.andWhere('invoice.id != :excludeInvoiceId', { excludeInvoiceId });
    }

    const conflict = await itemQb.getOne();
    if (conflict) {
      throw new BadRequestException(
        'One or more transactions are already linked to another active vendor invoice',
      );
    }

    return rows;
  }

  private sumTransactionAmounts(transactions: Transaction[]) {
    return transactions.reduce(
      (sum, tx) => sum + this.transactionAmount(tx),
      0,
    );
  }

  /** Prefer credit (payable increase); fall back to debit. */
  private transactionAmount(tx: Transaction) {
    const credit = Number(tx.creditAmount) || 0;
    if (credit > 0) return Math.round(credit * 100) / 100;
    const debit = Number(tx.debitAmount) || 0;
    return Math.round(debit * 100) / 100;
  }

  private async generateUniqueInvoiceNumber() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = await nextSerialCode(
        this.invoiceRepo,
        VENDOR_INVOICE_PREFIX,
        'invoiceNumber',
        VOUCHER_CODE_PAD,
        attempt,
      );
      const existing = await this.invoiceRepo.findOne({
        where: { invoiceNumber },
      });
      if (!existing) return invoiceNumber;
    }
    throw new BadRequestException('Could not generate vendor invoice number');
  }

  private async ensureVendor(vendorId: string) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (vendor.status === VendorStatus.BLOCKED) {
      throw new BadRequestException('Vendor is blocked');
    }
    return vendor;
  }

  private async findByIdOrFail(id: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        items: { transaction: { chartOfAccount: true } },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!invoice) {
      throw new NotFoundException('Vendor invoice not found');
    }
    return invoice;
  }

  private assertEditable(invoice: VendorInvoice) {
    if (invoice.status !== VendorInvoiceStatus.PENDING) {
      throw new BadRequestException(
        'Only pending vendor invoices can be updated',
      );
    }
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

  private toListResponse(invoice: VendorInvoice) {
    return {
      id: invoice.id,
      vendorId: invoice.vendorId,
      invoiceNumber: invoice.invoiceNumber,
      description: invoice.description ?? null,
      invoiceDate: invoice.invoiceDate,
      totalAmount: Number(invoice.totalAmount).toFixed(2),
      remarks: invoice.remarks ?? null,
      status: invoice.status,
      vendor: invoice.vendor
        ? {
            id: invoice.vendor.id,
            vendorName: invoice.vendor.vendorName ?? null,
            ownerName: invoice.vendor.ownerName,
            email: invoice.vendor.email ?? null,
          }
        : null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  private toDetailResponse(invoice: VendorInvoice) {
    return {
      ...this.toListResponse(invoice),
      items: (invoice.items ?? []).map((item) => ({
        id: item.id,
        transactionId: item.transactionId,
        transaction: item.transaction
          ? {
              id: item.transaction.id,
              referenceType: item.transaction.referenceType,
              referenceId: item.transaction.referenceId,
              transactionDate: item.transaction.transactionDate,
              description: item.transaction.description ?? null,
              debitAmount:
                item.transaction.debitAmount == null
                  ? null
                  : Number(item.transaction.debitAmount).toFixed(2),
              creditAmount:
                item.transaction.creditAmount == null
                  ? null
                  : Number(item.transaction.creditAmount).toFixed(2),
              entryType: item.transaction.entryType,
              showInLedger: item.transaction.showInLedger,
              chartOfAccount: item.transaction.chartOfAccount
                ? {
                    id: item.transaction.chartOfAccount.id,
                    code: item.transaction.chartOfAccount.code,
                    name: item.transaction.chartOfAccount.name,
                  }
                : null,
            }
          : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }
}
