import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangePurchaseOrderStatusDto,
  CreatePurchaseOrderFromQuotationDto,
  CreatePurchaseOrderItemDto,
  PurchaseOrderListQueryDto,
  ReplacePurchaseOrderItemsDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderItemDto,
} from '../auth/dto/purchase-order.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  nextSerialCode,
  PURCHASE_ORDER_PREFIX,
} from '../common/utils/serial-code.util';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../common/utils/public-link.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderReceivingStatus,
  PurchaseOrderStatus,
} from '../database/entities/maintenance/purchase-order.entity';
import {
  PurchaseQuotationItemType,
} from '../database/entities/maintenance/purchase-quotation.entity';
import { User } from '../database/entities/user.entity';
import { VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';
import { PurchaseQuotationsService } from './purchase-quotations.service';

const STATUS_TRANSITIONS: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  [PurchaseOrderStatus.DRAFT]: [
    PurchaseOrderStatus.PENDING_APPROVAL,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.PENDING_APPROVAL]: [
    PurchaseOrderStatus.APPROVED,
    PurchaseOrderStatus.REJECTED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.APPROVED]: [PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.REJECTED]: [PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.CANCELLED]: [],
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
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly itemRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly purchaseQuotationsService: PurchaseQuotationsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Primary create path: PO is generated from an approved PQ.
   * Approval does NOT increase inventory (receiving is GRN-only).
   */
  async createFromQuotation(
    dto: CreatePurchaseOrderFromQuotationDto,
    activity?: ActivityActorContext,
  ) {
    const pq = await this.purchaseQuotationsService.findApprovedEntityOrFail(
      dto.purchaseQuotationId,
    );

    const existingActive = await this.poRepo.count({
      where: {
        purchaseQuotationId: pq.id,
        status: Not(PurchaseOrderStatus.CANCELLED),
      },
    });
    if (existingActive > 0) {
      throw new BadRequestException(
        'An active purchase order already exists for this quotation',
      );
    }

    const status = dto.status ?? PurchaseOrderStatus.DRAFT;
    if (
      status !== PurchaseOrderStatus.DRAFT &&
      status !== PurchaseOrderStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        'Create status must be draft or pending_approval',
      );
    }

    const discountAmount = this.roundMoney(
      dto.discountAmount !== undefined
        ? dto.discountAmount
        : Number(pq.discountAmount),
    );
    const taxAmount = this.roundMoney(
      dto.taxAmount !== undefined ? dto.taxAmount : Number(pq.taxAmount),
    );

    const lines = (pq.items ?? []).map((item) => ({
      itemType: item.itemType,
      productId: item.productId ?? null,
      itemName: item.itemName,
      description: item.description ?? null,
      quantity: this.roundQty(Number(item.quantity)),
      unitPrice: this.roundMoney(Number(item.unitPrice)),
      totalAmount: this.roundMoney(
        Number(item.quantity) * Number(item.unitPrice),
      ),
    }));

    const totals = this.computeTotals(lines, discountAmount, taxAmount);
    const purchaseOrderNo = await this.generateUniquePurchaseOrderNo();
    const orderDate = dto.orderDate
      ? this.toDateOnly(dto.orderDate)
      : new Date();

    const saved = await this.poRepo.save(
      this.poRepo.create({
        purchaseOrderNo,
        purchaseQuotationId: pq.id,
        vendorId: pq.vendorId,
        orderDate,
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? this.toDateOnly(dto.expectedDeliveryDate)
          : null,
        subTotal: totals.subTotal,
        discountAmount,
        taxAmount,
        grandTotal: totals.grandTotal,
        status,
        receivingStatus: PurchaseOrderReceivingStatus.NOT_RECEIVED,
        remarks:
          this.nullableTrim(dto.remarks) ??
          this.nullableTrim(pq.remarks) ??
          null,
        termsAndConditions:
          this.nullableTrim(dto.termsAndConditions) ??
          this.nullableTrim(pq.termsAndConditions) ??
          null,
      }),
    );

    await this.itemRepo.save(
      lines.map((item) =>
        this.itemRepo.create({
          purchaseOrderId: saved.id,
          itemType: item.itemType,
          productId: item.productId,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          receivedQuantity: 0,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrder',
        entityId: saved.id,
        record: saved.purchaseOrderNo,
        description: `Created purchase order ${saved.purchaseOrderNo} from quotation ${pq.quotationNo}`,
        metadata: {
          status,
          purchaseQuotationId: pq.id,
          itemCount: lines.length,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: PurchaseOrderListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.poRepo
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.purchaseQuotation', 'pq')
      .leftJoinAndSelect('pq.jobCard', 'jobCard')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy('po.createdAt', 'DESC')
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

  /** Public lookup by purchaseOrderNo (e.g. PO000001) or UUID. */
  async findPublic(codeOrId: string) {
    return this.toResponse(await this.findByCodeOrIdOrFail(codeOrId));
  }

  async getPublicQrPng(codeOrId: string) {
    const po = await this.findByCodeOrIdOrFail(codeOrId);
    const links = buildPublicApiLinks('purchase-orders', po.purchaseOrderNo);
    const buffer = await buildPublicQrPngBuffer(
      'purchase-orders',
      po.purchaseOrderNo,
    );
    return {
      buffer,
      filename: `${po.purchaseOrderNo}-qr.png`,
      purchaseOrderNo: po.purchaseOrderNo,
      publicUrl: links.publicUrl,
    };
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    activity?: ActivityActorContext,
  ) {
    const po = await this.findByIdOrFail(id);
    this.assertEditable(po);

    if (dto.orderDate !== undefined) {
      po.orderDate = this.toDateOnly(dto.orderDate);
    }
    if (dto.expectedDeliveryDate !== undefined) {
      po.expectedDeliveryDate = dto.expectedDeliveryDate
        ? this.toDateOnly(dto.expectedDeliveryDate)
        : null;
    }
    if (dto.discountAmount !== undefined) {
      po.discountAmount = this.roundMoney(dto.discountAmount);
    }
    if (dto.taxAmount !== undefined) {
      po.taxAmount = this.roundMoney(dto.taxAmount);
    }
    if (dto.remarks !== undefined) {
      po.remarks = this.nullableTrim(dto.remarks);
    }
    if (dto.termsAndConditions !== undefined) {
      po.termsAndConditions = this.nullableTrim(dto.termsAndConditions);
    }

    this.recomputeHeaderTotals(po);
    await this.poRepo.save(po);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrder',
        entityId: po.id,
        record: po.purchaseOrderNo,
        description: `Updated purchase order ${po.purchaseOrderNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangePurchaseOrderStatusDto,
    activity?: ActivityActorContext,
    actorUserId?: string,
  ) {
    const po = await this.findByIdOrFail(id);
    const next = dto.status;

    if (po.status === next) {
      return this.toResponse(po);
    }

    const allowed = STATUS_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${po.status} to ${next}`,
      );
    }

    if (
      next === PurchaseOrderStatus.PENDING_APPROVAL ||
      next === PurchaseOrderStatus.APPROVED
    ) {
      this.assertHasItems(po);
    }

    if (next === PurchaseOrderStatus.APPROVED) {
      // Explicit rule: PO approval does NOT increase inventory.
      po.approvedAt = new Date();
      po.approvedById = actorUserId ?? null;
      if (actorUserId) {
        await this.ensureUser(actorUserId);
      }
    }

    if (next === PurchaseOrderStatus.CANCELLED) {
      if (
        po.receivingStatus !== PurchaseOrderReceivingStatus.NOT_RECEIVED
      ) {
        throw new BadRequestException(
          'Cannot cancel a purchase order that has already received goods',
        );
      }
      po.approvedAt = null;
      po.approvedById = null;
    }

    if (
      next === PurchaseOrderStatus.REJECTED ||
      next === PurchaseOrderStatus.PENDING_APPROVAL ||
      next === PurchaseOrderStatus.DRAFT
    ) {
      po.approvedAt = null;
      po.approvedById = null;
    }

    po.status = next;
    await this.poRepo.save(po);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrder',
        entityId: po.id,
        record: po.purchaseOrderNo,
        description: `Changed purchase order ${po.purchaseOrderNo} status to ${next}`,
        metadata: { status: next, receivingStatus: po.receivingStatus },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const po = await this.findByIdOrFail(id);
    if (
      po.status !== PurchaseOrderStatus.DRAFT &&
      po.status !== PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled purchase orders can be deleted',
      );
    }
    if (po.receivingStatus !== PurchaseOrderReceivingStatus.NOT_RECEIVED) {
      throw new BadRequestException(
        'Cannot delete a purchase order that has received goods',
      );
    }

    const { purchaseOrderNo } = po;
    await this.poRepo.remove(po);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrder',
        entityId: id,
        record: purchaseOrderNo,
        description: `Deleted purchase order ${purchaseOrderNo}`,
      },
      activity,
    );

    return { id, purchaseOrderNo, deleted: true };
  }

  // ── Items (draft only) ─────────────────────────────────

  async addItem(
    purchaseOrderId: string,
    dto: CreatePurchaseOrderItemDto,
    activity?: ActivityActorContext,
  ) {
    const po = await this.findByIdOrFail(purchaseOrderId);
    this.assertEditable(po);

    const [normalized] = await this.normalizeItems([dto]);
    const item = await this.itemRepo.save(
      this.itemRepo.create({
        purchaseOrderId,
        itemType: normalized.itemType,
        productId: normalized.productId,
        itemName: normalized.itemName,
        description: normalized.description,
        quantity: normalized.quantity,
        unitPrice: normalized.unitPrice,
        totalAmount: normalized.totalAmount,
        receivedQuantity: 0,
      }),
    );

    po.items = [...(po.items ?? []), item];
    this.recomputeHeaderTotals(po);
    await this.poRepo.save(po);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrderItem',
        entityId: item.id,
        record: po.purchaseOrderNo,
        description: `Added item "${item.itemName}" to purchase order ${po.purchaseOrderNo}`,
      },
      activity,
    );

    return this.findOne(purchaseOrderId);
  }

  async updateItem(
    purchaseOrderId: string,
    itemId: string,
    dto: UpdatePurchaseOrderItemDto,
    activity?: ActivityActorContext,
  ) {
    const po = await this.findByIdOrFail(purchaseOrderId);
    this.assertEditable(po);
    const item = await this.findItemOrFail(purchaseOrderId, itemId);

    if (Number(item.receivedQuantity) > 0) {
      throw new BadRequestException(
        'Cannot edit an item that already has received quantity',
      );
    }

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

    const refreshed = await this.findByIdOrFail(purchaseOrderId);
    this.recomputeHeaderTotals(refreshed);
    await this.poRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrderItem',
        entityId: item.id,
        record: po.purchaseOrderNo,
        description: `Updated item on purchase order ${po.purchaseOrderNo}`,
      },
      activity,
    );

    return this.findOne(purchaseOrderId);
  }

  async removeItem(
    purchaseOrderId: string,
    itemId: string,
    activity?: ActivityActorContext,
  ) {
    const po = await this.findByIdOrFail(purchaseOrderId);
    this.assertEditable(po);
    const item = await this.findItemOrFail(purchaseOrderId, itemId);

    if (Number(item.receivedQuantity) > 0) {
      throw new BadRequestException(
        'Cannot remove an item that already has received quantity',
      );
    }

    const name = item.itemName;
    await this.itemRepo.remove(item);

    const refreshed = await this.findByIdOrFail(purchaseOrderId);
    this.recomputeHeaderTotals(refreshed);
    await this.poRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrderItem',
        entityId: itemId,
        record: po.purchaseOrderNo,
        description: `Removed item "${name}" from purchase order ${po.purchaseOrderNo}`,
      },
      activity,
    );

    return this.findOne(purchaseOrderId);
  }

  async replaceItems(
    purchaseOrderId: string,
    dto: ReplacePurchaseOrderItemsDto,
    activity?: ActivityActorContext,
  ) {
    const po = await this.findByIdOrFail(purchaseOrderId);
    this.assertEditable(po);

    const hasReceived = (po.items ?? []).some(
      (item) => Number(item.receivedQuantity) > 0,
    );
    if (hasReceived) {
      throw new BadRequestException(
        'Cannot replace items on a purchase order that has received goods',
      );
    }

    const normalizedItems = await this.normalizeItems(dto.items);
    await this.itemRepo.delete({ purchaseOrderId });
    await this.itemRepo.save(
      normalizedItems.map((item) =>
        this.itemRepo.create({
          purchaseOrderId,
          itemType: item.itemType,
          productId: item.productId,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          receivedQuantity: 0,
        }),
      ),
    );

    const refreshed = await this.findByIdOrFail(purchaseOrderId);
    this.recomputeHeaderTotals(refreshed);
    await this.poRepo.save(refreshed);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'PurchaseOrder',
        entityId: purchaseOrderId,
        record: po.purchaseOrderNo,
        description: `Replaced items on purchase order ${po.purchaseOrderNo}`,
        metadata: { itemCount: normalizedItems.length },
      },
      activity,
    );

    return this.findOne(purchaseOrderId);
  }

  /**
   * Recalculate receivingStatus from PRODUCT line receivedQuantity.
   * SERVICE lines are ignored (they never enter inventory / GRN).
   * Intended for use by GRN approval.
   */
  async recalculateReceivingStatus(purchaseOrderId: string) {
    const po = await this.findByIdOrFail(purchaseOrderId);
    const productLines = (po.items ?? []).filter(
      (item) => item.itemType === PurchaseQuotationItemType.PRODUCT,
    );

    if (!productLines.length) {
      // Service-only PO: nothing to receive via GRN.
      po.receivingStatus = PurchaseOrderReceivingStatus.RECEIVED;
      await this.poRepo.save(po);
      return this.toResponse(po);
    }

    let anyReceived = false;
    let allFullyReceived = true;

    for (const item of productLines) {
      const ordered = Number(item.quantity);
      const received = Number(item.receivedQuantity);
      if (received > 0) anyReceived = true;
      if (received + 1e-9 < ordered) allFullyReceived = false;
      if (received > ordered + 1e-9) {
        throw new BadRequestException(
          `receivedQuantity exceeds ordered quantity for item ${item.itemName}`,
        );
      }
    }

    if (!anyReceived) {
      po.receivingStatus = PurchaseOrderReceivingStatus.NOT_RECEIVED;
    } else if (allFullyReceived) {
      po.receivingStatus = PurchaseOrderReceivingStatus.RECEIVED;
    } else {
      po.receivingStatus = PurchaseOrderReceivingStatus.PARTIALLY_RECEIVED;
    }

    await this.poRepo.save(po);
    return this.toResponse(po);
  }

  // ── Helpers ────────────────────────────────────────────

  private async buildListSummary(query: PurchaseOrderListQueryDto) {
    const qb = this.poRepo
      .createQueryBuilder('po')
      .leftJoin('po.vendor', 'vendor')
      .leftJoin('po.purchaseQuotation', 'pq')
      .leftJoin('pq.jobCard', 'jobCard');

    this.applyListFilters(qb, query, { ignoreStatus: true });

    qb.select(
      `COALESCE(SUM(CASE WHEN po.status = :draft THEN 1 ELSE 0 END), 0)`,
      'draftCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = :pending THEN 1 ELSE 0 END), 0)`,
        'pendingApprovalCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = :rejected THEN 1 ELSE 0 END), 0)`,
        'rejectedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.receivingStatus = :notReceived THEN 1 ELSE 0 END), 0)`,
        'notReceivedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.receivingStatus = :partial THEN 1 ELSE 0 END), 0)`,
        'partiallyReceivedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN po.receivingStatus = :received THEN 1 ELSE 0 END), 0)`,
        'receivedCount',
      )
      .addSelect(`COUNT(po.id)`, 'totalCount')
      .setParameter('draft', PurchaseOrderStatus.DRAFT)
      .setParameter('pending', PurchaseOrderStatus.PENDING_APPROVAL)
      .setParameter('approved', PurchaseOrderStatus.APPROVED)
      .setParameter('rejected', PurchaseOrderStatus.REJECTED)
      .setParameter('cancelled', PurchaseOrderStatus.CANCELLED)
      .setParameter('notReceived', PurchaseOrderReceivingStatus.NOT_RECEIVED)
      .setParameter(
        'partial',
        PurchaseOrderReceivingStatus.PARTIALLY_RECEIVED,
      )
      .setParameter('received', PurchaseOrderReceivingStatus.RECEIVED);

    const raw = await qb.getRawOne<Record<string, string>>();

    return {
      draftCount: Number(raw?.draftCount ?? 0),
      pendingApprovalCount: Number(raw?.pendingApprovalCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      rejectedCount: Number(raw?.rejectedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      notReceivedCount: Number(raw?.notReceivedCount ?? 0),
      partiallyReceivedCount: Number(raw?.partiallyReceivedCount ?? 0),
      receivedCount: Number(raw?.receivedCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<PurchaseOrder>,
    query: PurchaseOrderListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('po.status = :status', { status: query.status });
    }
    if (query.receivingStatus) {
      qb.andWhere('po.receivingStatus = :receivingStatus', {
        receivingStatus: query.receivingStatus,
      });
    }
    if (query.vendorId) {
      qb.andWhere('po.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.purchaseQuotationId) {
      qb.andWhere('po.purchaseQuotationId = :purchaseQuotationId', {
        purchaseQuotationId: query.purchaseQuotationId,
      });
    }
    if (query.jobCardId) {
      qb.andWhere('pq.jobCardId = :jobCardId', {
        jobCardId: query.jobCardId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          po.purchaseOrderNo ILIKE :search
          OR po.remarks ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
          OR pq.quotationNo ILIKE :search
          OR jobCard.jobCardNo ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private async findByIdOrFail(id: string): Promise<PurchaseOrder> {
    const po = await this.poRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        purchaseQuotation: { jobCard: true },
        items: { product: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    return po;
  }

  private async findByCodeOrIdOrFail(codeOrId: string): Promise<PurchaseOrder> {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Purchase order not found');
    }

    if (isUuid) {
      return this.findByIdOrFail(key);
    }

    const po = await this.poRepo.findOne({
      where: { purchaseOrderNo: key.toUpperCase() },
      relations: {
        vendor: true,
        purchaseQuotation: { jobCard: true },
        items: { product: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    return po;
  }

  private async findItemOrFail(
    purchaseOrderId: string,
    itemId: string,
  ): Promise<PurchaseOrderItem> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, purchaseOrderId },
    });
    if (!item) {
      throw new NotFoundException('Purchase order item not found');
    }
    return item;
  }

  private assertEditable(po: PurchaseOrder) {
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a ${po.status} purchase order`,
      );
    }
  }

  private assertHasItems(po: PurchaseOrder) {
    if (!po.items?.length) {
      throw new BadRequestException(
        'Purchase order must have at least one item',
      );
    }
  }

  private async ensureUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Approver user not found');
    }
    return user;
  }

  private async normalizeItems(items: CreatePurchaseOrderItemDto[]) {
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

    return {
      itemType: item.itemType,
      productId,
      itemName,
      description: this.nullableTrim(item.description),
      quantity,
      unitPrice,
    };
  }

  private recomputeHeaderTotals(po: PurchaseOrder) {
    const items = po.items ?? [];
    const subTotal = this.roundMoney(
      items.reduce((sum, item) => sum + Number(item.totalAmount), 0),
    );
    const discountAmount = this.roundMoney(Number(po.discountAmount ?? 0));
    const taxAmount = this.roundMoney(Number(po.taxAmount ?? 0));
    const grandTotal = this.roundMoney(subTotal - discountAmount + taxAmount);
    if (grandTotal < 0) {
      throw new BadRequestException(
        'grandTotal cannot be negative (check discount)',
      );
    }
    po.subTotal = subTotal;
    po.discountAmount = discountAmount;
    po.taxAmount = taxAmount;
    po.grandTotal = grandTotal;
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

  private async generateUniquePurchaseOrderNo(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.poRepo,
        PURCHASE_ORDER_PREFIX,
        'purchaseOrderNo',
        6,
        attempt,
      );
      const existing = await this.poRepo.findOne({
        where: { purchaseOrderNo: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique purchase order number',
    );
  }

  private toResponse(po: PurchaseOrder) {
    const pq = po.purchaseQuotation;
    const links = buildPublicApiLinks('purchase-orders', po.purchaseOrderNo);
    return {
      id: po.id,
      purchaseOrderNo: po.purchaseOrderNo,
      purchaseQuotationId: po.purchaseQuotationId,
      vendorId: po.vendorId,
      orderDate: this.formatDate(po.orderDate),
      expectedDeliveryDate: po.expectedDeliveryDate
        ? this.formatDate(po.expectedDeliveryDate)
        : null,
      subTotal: this.formatMoney(po.subTotal),
      discountAmount: this.formatMoney(po.discountAmount),
      taxAmount: this.formatMoney(po.taxAmount),
      grandTotal: this.formatMoney(po.grandTotal),
      status: po.status,
      receivingStatus: po.receivingStatus,
      approvedById: po.approvedById ?? null,
      approvedAt: po.approvedAt ?? null,
      remarks: po.remarks ?? null,
      termsAndConditions: po.termsAndConditions ?? null,
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      vendor: po.vendor
        ? {
            id: po.vendor.id,
            vendorName: po.vendor.vendorName ?? null,
            ownerName: po.vendor.ownerName,
            status: po.vendor.status,
          }
        : null,
      purchaseQuotation: pq
        ? {
            id: pq.id,
            quotationNo: pq.quotationNo,
            status: pq.status,
            jobCardId: pq.jobCardId ?? null,
            jobCard: pq.jobCard
              ? {
                  id: pq.jobCard.id,
                  jobCardNo: pq.jobCard.jobCardNo,
                  jobCardTitle: pq.jobCard.jobCardTitle,
                  status: pq.jobCard.status,
                }
              : null,
          }
        : null,
      items: (po.items ?? []).map((item) => this.toItemResponse(item)),
    };
  }

  private toItemResponse(item: PurchaseOrderItem) {
    return {
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      itemType: item.itemType,
      productId: item.productId ?? null,
      itemName: item.itemName,
      description: item.description ?? null,
      quantity: this.formatQty(item.quantity),
      unitPrice: this.formatMoney(item.unitPrice),
      totalAmount: this.formatMoney(item.totalAmount),
      receivedQuantity: this.formatQty(item.receivedQuantity),
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

  private toDateOnly(value: string | Date): Date {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${String(value)}`);
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
