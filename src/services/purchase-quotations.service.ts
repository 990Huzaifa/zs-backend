import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangePurchaseQuotationStatusDto,
  CreatePurchaseQuotationDto,
  CreatePurchaseQuotationItemDto,
  PurchaseQuotationListQueryDto,
  ReplacePurchaseQuotationItemsDto,
  UpdatePurchaseQuotationDto,
  UpdatePurchaseQuotationItemDto,
} from '../auth/dto/purchase-quotation.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  nextSerialCode,
  PURCHASE_QUOTATION_PREFIX,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { JobCard } from '../database/entities/maintenance/jobcard.entity';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../database/entities/maintenance/purchase-order.entity';
import {
  PurchaseQuotation,
  PurchaseQuotationItem,
  PurchaseQuotationItemType,
  PurchaseQuotationStatus,
} from '../database/entities/maintenance/purchase-quotation.entity';
import { Vendor, VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

const STATUS_TRANSITIONS: Record<
  PurchaseQuotationStatus,
  PurchaseQuotationStatus[]
> = {
  [PurchaseQuotationStatus.DRAFT]: [
    PurchaseQuotationStatus.SUBMITTED,
    PurchaseQuotationStatus.CANCELLED,
  ],
  [PurchaseQuotationStatus.SUBMITTED]: [
    PurchaseQuotationStatus.APPROVED,
    PurchaseQuotationStatus.REJECTED,
    PurchaseQuotationStatus.CANCELLED,
  ],
  [PurchaseQuotationStatus.APPROVED]: [PurchaseQuotationStatus.CANCELLED],
  [PurchaseQuotationStatus.REJECTED]: [PurchaseQuotationStatus.CANCELLED],
  [PurchaseQuotationStatus.CANCELLED]: [],
};

type LineInput = {
  itemType: PurchaseQuotationItemType;
  productId?: string | null;
  itemName: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
};

@Injectable()
export class PurchaseQuotationsService {
  constructor(
    @InjectRepository(PurchaseQuotation)
    private readonly pqRepo: Repository<PurchaseQuotation>,
    @InjectRepository(PurchaseQuotationItem)
    private readonly itemRepo: Repository<PurchaseQuotationItem>,
    @InjectRepository(JobCard)
    private readonly jobCardRepo: Repository<JobCard>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreatePurchaseQuotationDto, activity?: ActivityActorContext) {
    if (dto.jobCardId) await this.ensureJobCard(dto.jobCardId);
    await this.ensureVendor(dto.vendorId);

    const status = dto.status ?? PurchaseQuotationStatus.DRAFT;
    if (
      status !== PurchaseQuotationStatus.DRAFT &&
      status !== PurchaseQuotationStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Create status must be draft or submitted',
      );
    }

    const normalizedItems = await this.normalizeItems(dto.items);
    const discountAmount = this.roundMoney(dto.discountAmount ?? 0);
    const taxAmount = this.roundMoney(dto.taxAmount ?? 0);
    const totals = this.computeTotals(normalizedItems, discountAmount, taxAmount);

    const quotationNo = await this.generateUniqueQuotationNo();

    const saved = await this.pqRepo.save(
      this.pqRepo.create({
        quotationNo,
        jobCardId: dto.jobCardId ?? null,
        vendorId: dto.vendorId,
        vendorQuotationNo: this.nullableTrim(dto.vendorQuotationNo),
        quotationDate: this.toDateOnly(dto.quotationDate),
        validUntil: dto.validUntil ? this.toDateOnly(dto.validUntil) : null,
        subTotal: totals.subTotal,
        discountAmount,
        taxAmount,
        grandTotal: totals.grandTotal,
        status,
        termsAndConditions: this.nullableTrim(dto.termsAndConditions),
        remarks: this.nullableTrim(dto.remarks),
      }),
    );

    await this.itemRepo.save(
      normalizedItems.map((item) =>
        this.itemRepo.create({
          purchaseQuotationId: saved.id,
          itemType: item.itemType,
          productId: item.productId,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotation',
        entityId: saved.id,
        record: saved.quotationNo,
        description: `Created purchase quotation ${saved.quotationNo}`,
        metadata: {
          status,
          jobCardId: saved.jobCardId,
          itemCount: normalizedItems.length,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: PurchaseQuotationListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.pqRepo
      .createQueryBuilder('pq')
      .leftJoinAndSelect('pq.vendor', 'vendor')
      .leftJoinAndSelect('pq.jobCard', 'jobCard')
      .leftJoinAndSelect('pq.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy('pq.createdAt', 'DESC')
      .addOrderBy('items.createdAt', 'ASC')
      .skip(skip)
      .take(limit);

    this.applyListFilters(qb, query);

    const [rows, total] = await qb.getManyAndCount();
    const summary = await this.buildListSummary(query);

    return {
      data: rows.map((row) => this.toResponse(row)),
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

  async update(
    id: string,
    dto: UpdatePurchaseQuotationDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(id);
    this.assertEditable(pq);

    if (dto.jobCardId !== undefined) {
      if (dto.jobCardId) await this.ensureJobCard(dto.jobCardId);
      pq.jobCardId = dto.jobCardId;
    }
    if (dto.vendorId !== undefined) {
      await this.ensureVendor(dto.vendorId);
      pq.vendorId = dto.vendorId;
    }
    if (dto.vendorQuotationNo !== undefined) {
      pq.vendorQuotationNo = this.nullableTrim(dto.vendorQuotationNo);
    }
    if (dto.quotationDate !== undefined) {
      pq.quotationDate = this.toDateOnly(dto.quotationDate);
    }
    if (dto.validUntil !== undefined) {
      pq.validUntil = dto.validUntil
        ? this.toDateOnly(dto.validUntil)
        : null;
    }
    if (dto.discountAmount !== undefined) {
      pq.discountAmount = this.roundMoney(dto.discountAmount);
    }
    if (dto.taxAmount !== undefined) {
      pq.taxAmount = this.roundMoney(dto.taxAmount);
    }
    if (dto.termsAndConditions !== undefined) {
      pq.termsAndConditions = this.nullableTrim(dto.termsAndConditions);
    }
    if (dto.remarks !== undefined) {
      pq.remarks = this.nullableTrim(dto.remarks);
    }

    this.recomputeHeaderTotals(pq);
    await this.pqRepo.save(pq);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotation',
        entityId: pq.id,
        record: pq.quotationNo,
        description: `Updated purchase quotation ${pq.quotationNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangePurchaseQuotationStatusDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(id);
    const next = dto.status;

    if (pq.status === next) {
      return this.toResponse(pq);
    }

    const allowed = STATUS_TRANSITIONS[pq.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${pq.status} to ${next}`,
      );
    }

    if (next === PurchaseQuotationStatus.SUBMITTED) {
      this.assertHasItems(pq);
    }

    if (next === PurchaseQuotationStatus.APPROVED) {
      this.assertHasItems(pq);
      if (dto.rejectSiblingQuotations !== false && pq.jobCardId) {
        await this.rejectSiblingQuotations(pq);
      }
    }

    if (next === PurchaseQuotationStatus.CANCELLED) {
      // Cancel only if no non-cancelled PO exists (checked by PO service
      // when creating; here we block cancel of approved PQ that already
      // has an active PO via a lightweight existence check).
      const linkedPoCount = await this.countActivePurchaseOrders(pq.id);
      if (linkedPoCount > 0) {
        throw new BadRequestException(
          'Cannot cancel a quotation that already has an active purchase order',
        );
      }
    }

    pq.status = next;
    await this.pqRepo.save(pq);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotation',
        entityId: pq.id,
        record: pq.quotationNo,
        description: `Changed purchase quotation ${pq.quotationNo} status to ${next}`,
        metadata: { status: next },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const pq = await this.findByIdOrFail(id);
    if (
      pq.status !== PurchaseQuotationStatus.DRAFT &&
      pq.status !== PurchaseQuotationStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled quotations can be deleted',
      );
    }

    const { quotationNo } = pq;
    await this.pqRepo.remove(pq);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotation',
        entityId: id,
        record: quotationNo,
        description: `Deleted purchase quotation ${quotationNo}`,
      },
      activity,
    );

    return { id, quotationNo, deleted: true };
  }

  // ── Items ──────────────────────────────────────────────

  async addItem(
    quotationId: string,
    dto: CreatePurchaseQuotationItemDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(quotationId);
    this.assertEditable(pq);

    const [normalized] = await this.normalizeItems([dto]);
    const item = await this.itemRepo.save(
      this.itemRepo.create({
        purchaseQuotationId: quotationId,
        itemType: normalized.itemType,
        productId: normalized.productId,
        itemName: normalized.itemName,
        description: normalized.description,
        quantity: normalized.quantity,
        unitPrice: normalized.unitPrice,
        totalAmount: normalized.totalAmount,
      }),
    );

    pq.items = [...(pq.items ?? []), item];
    this.recomputeHeaderTotals(pq);
    await this.pqRepo.save(pq);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotationItem',
        entityId: item.id,
        record: pq.quotationNo,
        description: `Added item "${item.itemName}" to quotation ${pq.quotationNo}`,
      },
      activity,
    );

    return this.findOne(quotationId);
  }

  async updateItem(
    quotationId: string,
    itemId: string,
    dto: UpdatePurchaseQuotationItemDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(quotationId);
    this.assertEditable(pq);
    const item = await this.findItemOrFail(quotationId, itemId);

    if (dto.itemType !== undefined) item.itemType = dto.itemType;
    if (dto.productId !== undefined) item.productId = dto.productId;
    if (dto.itemName !== undefined) item.itemName = dto.itemName.trim();
    if (dto.description !== undefined) {
      item.description = this.nullableTrim(dto.description);
    }
    if (dto.quantity !== undefined) {
      item.quantity = this.roundQty(dto.quantity);
    }
    if (dto.unitPrice !== undefined) {
      item.unitPrice = this.roundMoney(dto.unitPrice);
    }

    await this.validateLine({
      itemType: item.itemType,
      productId: item.productId,
      itemName: item.itemName,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    });

    item.totalAmount = this.roundMoney(
      Number(item.quantity) * Number(item.unitPrice),
    );
    await this.itemRepo.save(item);

    const refreshed = await this.findByIdOrFail(quotationId);
    this.recomputeHeaderTotals(refreshed);
    await this.pqRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotationItem',
        entityId: item.id,
        record: pq.quotationNo,
        description: `Updated item on quotation ${pq.quotationNo}`,
      },
      activity,
    );

    return this.findOne(quotationId);
  }

  async removeItem(
    quotationId: string,
    itemId: string,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(quotationId);
    this.assertEditable(pq);
    const item = await this.findItemOrFail(quotationId, itemId);
    const name = item.itemName;

    await this.itemRepo.remove(item);

    const refreshed = await this.findByIdOrFail(quotationId);
    this.recomputeHeaderTotals(refreshed);
    await this.pqRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotationItem',
        entityId: itemId,
        record: pq.quotationNo,
        description: `Removed item "${name}" from quotation ${pq.quotationNo}`,
      },
      activity,
    );

    return this.findOne(quotationId);
  }

  async replaceItems(
    quotationId: string,
    dto: ReplacePurchaseQuotationItemsDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.findByIdOrFail(quotationId);
    this.assertEditable(pq);

    const normalizedItems = await this.normalizeItems(dto.items);
    await this.itemRepo.delete({ purchaseQuotationId: quotationId });
    await this.itemRepo.save(
      normalizedItems.map((item) =>
        this.itemRepo.create({
          purchaseQuotationId: quotationId,
          itemType: item.itemType,
          productId: item.productId,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
        }),
      ),
    );

    const refreshed = await this.findByIdOrFail(quotationId);
    this.recomputeHeaderTotals(refreshed);
    await this.pqRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseQuotation',
        entityId: quotationId,
        record: pq.quotationNo,
        description: `Replaced items on quotation ${pq.quotationNo}`,
        metadata: { itemCount: normalizedItems.length },
      },
      activity,
    );

    return this.findOne(quotationId);
  }

  /** Used by PO service when creating from approved PQ. */
  async findApprovedEntityOrFail(id: string): Promise<PurchaseQuotation> {
    const pq = await this.findByIdOrFail(id);
    if (pq.status !== PurchaseQuotationStatus.APPROVED) {
      throw new BadRequestException(
        'Purchase order can only be created from an approved quotation',
      );
    }
    this.assertHasItems(pq);
    return pq;
  }

  // ── Helpers ────────────────────────────────────────────

  private async rejectSiblingQuotations(approved: PurchaseQuotation) {
    if (!approved.jobCardId) return;

    const siblings = await this.pqRepo.find({
      where: {
        jobCardId: approved.jobCardId,
        id: Not(approved.id),
        status: In([
          PurchaseQuotationStatus.DRAFT,
          PurchaseQuotationStatus.SUBMITTED,
        ]),
      },
    });

    if (!siblings.length) return;

    for (const sibling of siblings) {
      sibling.status = PurchaseQuotationStatus.REJECTED;
    }
    await this.pqRepo.save(siblings);
  }

  private async countActivePurchaseOrders(purchaseQuotationId: string) {
    return this.poRepo.count({
      where: {
        purchaseQuotationId,
        status: Not(PurchaseOrderStatus.CANCELLED),
      },
    });
  }

  private async buildListSummary(query: PurchaseQuotationListQueryDto) {
    const qb = this.pqRepo
      .createQueryBuilder('pq')
      .leftJoin('pq.vendor', 'vendor')
      .leftJoin('pq.jobCard', 'jobCard');

    this.applyListFilters(qb, query, { ignoreStatus: true });

    qb.select(
      `COALESCE(SUM(CASE WHEN pq.status = :draft THEN 1 ELSE 0 END), 0)`,
      'draftCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN pq.status = :submitted THEN 1 ELSE 0 END), 0)`,
        'submittedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN pq.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN pq.status = :rejected THEN 1 ELSE 0 END), 0)`,
        'rejectedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN pq.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(pq.id)`, 'totalCount')
      .setParameter('draft', PurchaseQuotationStatus.DRAFT)
      .setParameter('submitted', PurchaseQuotationStatus.SUBMITTED)
      .setParameter('approved', PurchaseQuotationStatus.APPROVED)
      .setParameter('rejected', PurchaseQuotationStatus.REJECTED)
      .setParameter('cancelled', PurchaseQuotationStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();

    return {
      draftCount: Number(raw?.draftCount ?? 0),
      submittedCount: Number(raw?.submittedCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      rejectedCount: Number(raw?.rejectedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<PurchaseQuotation>,
    query: PurchaseQuotationListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('pq.status = :status', { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere('pq.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.jobCardId) {
      qb.andWhere('pq.jobCardId = :jobCardId', {
        jobCardId: query.jobCardId,
      });
    }
    if (query.bulkOnly === true) {
      qb.andWhere('pq.jobCardId IS NULL');
    } else if (query.bulkOnly === false) {
      qb.andWhere('pq.jobCardId IS NOT NULL');
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          pq.quotationNo ILIKE :search
          OR pq.vendorQuotationNo ILIKE :search
          OR pq.remarks ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
          OR jobCard.jobCardNo ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private async findByIdOrFail(id: string): Promise<PurchaseQuotation> {
    const pq = await this.pqRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        jobCard: true,
        items: { product: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!pq) {
      throw new NotFoundException('Purchase quotation not found');
    }
    return pq;
  }

  private async findItemOrFail(
    purchaseQuotationId: string,
    itemId: string,
  ): Promise<PurchaseQuotationItem> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, purchaseQuotationId },
    });
    if (!item) {
      throw new NotFoundException('Purchase quotation item not found');
    }
    return item;
  }

  private assertEditable(pq: PurchaseQuotation) {
    if (pq.status !== PurchaseQuotationStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a ${pq.status} purchase quotation`,
      );
    }
  }

  private assertHasItems(pq: PurchaseQuotation) {
    if (!pq.items?.length) {
      throw new BadRequestException(
        'Purchase quotation must have at least one item',
      );
    }
  }

  private async ensureJobCard(id: string) {
    const jobCard = await this.jobCardRepo.findOne({ where: { id } });
    if (!jobCard) {
      throw new NotFoundException('Job card not found');
    }
    return jobCard;
  }

  private async ensureVendor(id: string) {
    const vendor = await this.vendorRepo.findOne({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  private async normalizeItems(items: CreatePurchaseQuotationItemDto[]) {
    const result: Array<LineInput & { totalAmount: number }> = [];
    for (const item of items) {
      const line = await this.validateLine(item);
      result.push({
        ...line,
        totalAmount: this.roundMoney(line.quantity * line.unitPrice),
      });
    }
    return result;
  }

  private async validateLine(item: LineInput) {
    const itemName = item.itemName.trim();
    if (!itemName) {
      throw new BadRequestException('itemName is required');
    }

    const quantity = this.roundQty(item.quantity);
    const unitPrice = this.roundMoney(item.unitPrice);
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be > 0');
    }
    if (unitPrice < 0) {
      throw new BadRequestException('unitPrice must be >= 0');
    }

    let productId: string | null = item.productId ?? null;
    if (productId) {
      const product = await this.productRepo.findOne({
        where: { id: productId },
      });
      if (!product) {
        throw new NotFoundException(`Product not found: ${productId}`);
      }
    }

    // SERVICE lines do not require a product; PRODUCT may still be custom
    // (productId null) for non-catalogue items.
    if (
      item.itemType === PurchaseQuotationItemType.SERVICE &&
      productId === undefined
    ) {
      productId = null;
    }

    return {
      itemType: item.itemType,
      productId,
      itemName,
      description: this.nullableTrim(item.description),
      quantity,
      unitPrice,
    };
  }

  private recomputeHeaderTotals(pq: PurchaseQuotation) {
    const items = pq.items ?? [];
    const subTotal = this.roundMoney(
      items.reduce((sum, item) => sum + Number(item.totalAmount), 0),
    );
    const discountAmount = this.roundMoney(Number(pq.discountAmount ?? 0));
    const taxAmount = this.roundMoney(Number(pq.taxAmount ?? 0));
    const grandTotal = this.roundMoney(subTotal - discountAmount + taxAmount);
    if (grandTotal < 0) {
      throw new BadRequestException(
        'grandTotal cannot be negative (check discount)',
      );
    }
    pq.subTotal = subTotal;
    pq.discountAmount = discountAmount;
    pq.taxAmount = taxAmount;
    pq.grandTotal = grandTotal;
  }

  private computeTotals(
    items: Array<{ totalAmount: number }>,
    discountAmount: number,
    taxAmount: number,
  ) {
    const subTotal = this.roundMoney(
      items.reduce((sum, item) => sum + item.totalAmount, 0),
    );
    const grandTotal = this.roundMoney(subTotal - discountAmount + taxAmount);
    if (grandTotal < 0) {
      throw new BadRequestException(
        'grandTotal cannot be negative (check discount)',
      );
    }
    return { subTotal, grandTotal };
  }

  private async generateUniqueQuotationNo(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.pqRepo,
        PURCHASE_QUOTATION_PREFIX,
        'quotationNo',
        6,
        attempt,
      );
      const existing = await this.pqRepo.findOne({
        where: { quotationNo: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique quotation number',
    );
  }

  private toResponse(pq: PurchaseQuotation) {
    return {
      id: pq.id,
      quotationNo: pq.quotationNo,
      jobCardId: pq.jobCardId ?? null,
      vendorId: pq.vendorId,
      vendorQuotationNo: pq.vendorQuotationNo ?? null,
      quotationDate: this.formatDate(pq.quotationDate),
      validUntil: pq.validUntil ? this.formatDate(pq.validUntil) : null,
      subTotal: this.formatMoney(pq.subTotal),
      discountAmount: this.formatMoney(pq.discountAmount),
      taxAmount: this.formatMoney(pq.taxAmount),
      grandTotal: this.formatMoney(pq.grandTotal),
      status: pq.status,
      termsAndConditions: pq.termsAndConditions ?? null,
      remarks: pq.remarks ?? null,
      createdAt: pq.createdAt,
      updatedAt: pq.updatedAt,
      vendor: pq.vendor
        ? {
            id: pq.vendor.id,
            vendorName: pq.vendor.vendorName ?? null,
            ownerName: pq.vendor.ownerName,
            status: pq.vendor.status,
          }
        : null,
      jobCard: pq.jobCard
        ? {
            id: pq.jobCard.id,
            jobCardNo: pq.jobCard.jobCardNo,
            jobCardTitle: pq.jobCard.jobCardTitle,
            status: pq.jobCard.status,
          }
        : null,
      items: (pq.items ?? []).map((item) => this.toItemResponse(item)),
    };
  }

  private toItemResponse(item: PurchaseQuotationItem) {
    return {
      id: item.id,
      purchaseQuotationId: item.purchaseQuotationId,
      itemType: item.itemType,
      productId: item.productId ?? null,
      itemName: item.itemName,
      description: item.description ?? null,
      quantity: this.formatQty(item.quantity),
      unitPrice: this.formatMoney(item.unitPrice),
      totalAmount: this.formatMoney(item.totalAmount),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
          }
        : null,
    };
  }

  private toDateOnly(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return d;
  }

  private formatDate(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private formatMoney(value: number | string): string {
    return this.roundMoney(Number(value)).toFixed(2);
  }

  private formatQty(value: number | string): string {
    return this.roundQty(Number(value)).toFixed(2);
  }

  private roundMoney(value: number): number {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n)) {
      throw new BadRequestException('Invalid money value');
    }
    return n;
  }

  private roundQty(value: number): number {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n)) {
      throw new BadRequestException('Invalid quantity');
    }
    return n;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }
}
