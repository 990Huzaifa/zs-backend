import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeGrnStatusDto,
  CreateGrnDto,
  CreateGrnItemDto,
  GrnListQueryDto,
  ReplaceGrnItemsDto,
  UpdateGrnDto,
  UpdateGrnItemDto,
} from '../auth/dto/grn.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { GRN_PREFIX, nextSerialCode } from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  GoodsReceiptNote,
  GoodsReceiptNoteItem,
  GRNStatus,
} from '../database/entities/maintenance/grn.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderReceivingStatus,
  PurchaseOrderStatus,
} from '../database/entities/maintenance/purchase-order.entity';
import { PurchaseQuotationItemType } from '../database/entities/maintenance/purchase-quotation.entity';
import { User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { MaintenanceInventoryService } from './maintenance-inventory.service';

const STATUS_TRANSITIONS: Record<GRNStatus, GRNStatus[]> = {
  [GRNStatus.DRAFT]: [GRNStatus.PENDING_APPROVAL, GRNStatus.CANCELLED],
  [GRNStatus.PENDING_APPROVAL]: [
    GRNStatus.APPROVED,
    GRNStatus.REJECTED,
    GRNStatus.CANCELLED,
  ],
  [GRNStatus.APPROVED]: [],
  [GRNStatus.REJECTED]: [GRNStatus.CANCELLED],
  [GRNStatus.CANCELLED]: [],
};

@Injectable()
export class GoodsReceiptNotesService {
  constructor(
    @InjectRepository(GoodsReceiptNote)
    private readonly grnRepo: Repository<GoodsReceiptNote>,
    @InjectRepository(GoodsReceiptNoteItem)
    private readonly itemRepo: Repository<GoodsReceiptNoteItem>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: MaintenanceInventoryService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateGrnDto, activity?: ActivityActorContext) {
    const po = await this.ensureApprovedPo(dto.purchaseOrderId);
    if (dto.receivedById) await this.ensureUser(dto.receivedById);

    const status = dto.status ?? GRNStatus.DRAFT;
    if (status !== GRNStatus.DRAFT && status !== GRNStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Create status must be draft or pending_approval',
      );
    }

    const normalized = await this.normalizeItems(po, dto.items);
    const grnNo = await this.generateUniqueGrnNo();

    const saved = await this.grnRepo.save(
      this.grnRepo.create({
        grnNo,
        purchaseOrderId: po.id,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        receivedById: dto.receivedById ?? null,
        vendorDocumentNo: this.nullableTrim(dto.vendorDocumentNo),
        status,
        remarks: this.nullableTrim(dto.remarks),
      }),
    );

    await this.itemRepo.save(
      normalized.map((item) =>
        this.itemRepo.create({
          grnId: saved.id,
          productId: item.productId,
          purchaseOrderItemId: item.purchaseOrderItemId,
          receivedQuantity: item.receivedQuantity,
          rejectedQuantity: item.rejectedQuantity,
          remarks: item.remarks,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: saved.id,
        record: saved.grnNo,
        description: `Created GRN ${saved.grnNo}`,
        metadata: { status, purchaseOrderId: po.id, itemCount: normalized.length },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: GrnListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.grnRepo
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.purchaseOrder', 'po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('grn.receivedBy', 'receivedBy')
      .leftJoinAndSelect('grn.approvedBy', 'approvedBy')
      .leftJoinAndSelect('grn.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy('grn.createdAt', 'DESC')
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
    dto: UpdateGrnDto,
    activity?: ActivityActorContext,
  ) {
    const grn = await this.findByIdOrFail(id);
    this.assertEditable(grn);

    if (dto.receivedAt !== undefined) {
      grn.receivedAt = new Date(dto.receivedAt);
    }
    if (dto.receivedById !== undefined) {
      if (dto.receivedById) await this.ensureUser(dto.receivedById);
      grn.receivedById = dto.receivedById;
    }
    if (dto.vendorDocumentNo !== undefined) {
      grn.vendorDocumentNo = this.nullableTrim(dto.vendorDocumentNo);
    }
    if (dto.remarks !== undefined) {
      grn.remarks = this.nullableTrim(dto.remarks);
    }

    await this.grnRepo.save(grn);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: grn.id,
        record: grn.grnNo,
        description: `Updated GRN ${grn.grnNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeGrnStatusDto,
    activity?: ActivityActorContext,
    actorUserId?: string,
  ) {
    const grn = await this.findByIdOrFail(id);
    const next = dto.status;

    if (grn.status === next) {
      return this.toResponse(grn);
    }

    const allowed = STATUS_TRANSITIONS[grn.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${grn.status} to ${next}`,
      );
    }

    if (next === GRNStatus.PENDING_APPROVAL) {
      this.assertHasItems(grn);
    }

    if (next === GRNStatus.APPROVED) {
      return this.approveGrn(grn, activity, actorUserId);
    }

    if (next === GRNStatus.REJECTED || next === GRNStatus.CANCELLED) {
      grn.approvedAt = null;
      grn.approvedById = null;
    }

    grn.status = next;
    await this.grnRepo.save(grn);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: grn.id,
        record: grn.grnNo,
        description: `Changed GRN ${grn.grnNo} status to ${next}`,
        metadata: { status: next },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const grn = await this.findByIdOrFail(id);
    if (grn.status !== GRNStatus.DRAFT && grn.status !== GRNStatus.CANCELLED) {
      throw new BadRequestException(
        'Only draft or cancelled GRNs can be deleted',
      );
    }

    const { grnNo } = grn;
    await this.grnRepo.remove(grn);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: id,
        record: grnNo,
        description: `Deleted GRN ${grnNo}`,
      },
      activity,
    );

    return { id, grnNo, deleted: true };
  }

  // ── Items ──────────────────────────────────────────────

  async replaceItems(
    id: string,
    dto: ReplaceGrnItemsDto,
    activity?: ActivityActorContext,
  ) {
    const grn = await this.findByIdOrFail(id);
    this.assertEditable(grn);
    const po = await this.ensureApprovedPo(grn.purchaseOrderId);
    const normalized = await this.normalizeItems(po, dto.items, id);

    await this.itemRepo.delete({ grnId: id });
    await this.itemRepo.save(
      normalized.map((item) =>
        this.itemRepo.create({
          grnId: id,
          productId: item.productId,
          purchaseOrderItemId: item.purchaseOrderItemId,
          receivedQuantity: item.receivedQuantity,
          rejectedQuantity: item.rejectedQuantity,
          remarks: item.remarks,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: id,
        record: grn.grnNo,
        description: `Replaced items on GRN ${grn.grnNo}`,
        metadata: { itemCount: normalized.length },
      },
      activity,
    );

    return this.findOne(id);
  }

  async updateItem(
    grnId: string,
    itemId: string,
    dto: UpdateGrnItemDto,
    activity?: ActivityActorContext,
  ) {
    const grn = await this.findByIdOrFail(grnId);
    this.assertEditable(grn);
    const item = await this.findItemOrFail(grnId, itemId);
    const po = await this.ensureApprovedPo(grn.purchaseOrderId);

    if (dto.receivedQuantity !== undefined) {
      item.receivedQuantity = this.roundQty(dto.receivedQuantity);
    }
    if (dto.rejectedQuantity !== undefined) {
      item.rejectedQuantity = this.roundQty(dto.rejectedQuantity);
    }
    if (dto.remarks !== undefined) {
      item.remarks = this.nullableTrim(dto.remarks);
    }

    await this.validateItemAgainstPo(po, item, grnId);
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNoteItem',
        entityId: item.id,
        record: grn.grnNo,
        description: `Updated item on GRN ${grn.grnNo}`,
      },
      activity,
    );

    return this.findOne(grnId);
  }

  async removeItem(
    grnId: string,
    itemId: string,
    activity?: ActivityActorContext,
  ) {
    const grn = await this.findByIdOrFail(grnId);
    this.assertEditable(grn);
    const item = await this.findItemOrFail(grnId, itemId);
    await this.itemRepo.remove(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNoteItem',
        entityId: itemId,
        record: grn.grnNo,
        description: `Removed item from GRN ${grn.grnNo}`,
      },
      activity,
    );

    return this.findOne(grnId);
  }

  // ── Approve + inventory post ───────────────────────────

  private async approveGrn(
    grn: GoodsReceiptNote,
    activity?: ActivityActorContext,
    actorUserId?: string,
  ) {
    this.assertHasItems(grn);

    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(GoodsReceiptNote, {
        where: { id: grn.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('GRN not found');
      }
      if (locked.status === GRNStatus.APPROVED) {
        return;
      }
      if (locked.status !== GRNStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `Cannot approve GRN in status ${locked.status}`,
        );
      }

      const items = await manager.find(GoodsReceiptNoteItem, {
        where: { grnId: locked.id },
      });
      if (!items.length) {
        throw new BadRequestException('GRN must have at least one item');
      }

      const po = await manager.findOne(PurchaseOrder, {
        where: { id: locked.purchaseOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!po || po.status !== PurchaseOrderStatus.APPROVED) {
        throw new BadRequestException(
          'Purchase order must be approved to receive goods',
        );
      }

      const poItems = await manager.find(PurchaseOrderItem, {
        where: { purchaseOrderId: po.id },
        lock: { mode: 'pessimistic_write' },
      });
      po.items = poItems;

      await this.validateItemsForApprove(manager, po, items);

      for (const item of items) {
        const qty = this.inventoryService.toIntQty(
          Number(item.receivedQuantity),
          'receivedQuantity',
        );
        if (qty <= 0) continue;

        const poItem = poItems.find((p) => p.id === item.purchaseOrderItemId);
        if (!poItem) {
          throw new BadRequestException(
            `PO item not found: ${item.purchaseOrderItemId}`,
          );
        }

        await this.inventoryService.postStockIn(manager, {
          productId: item.productId,
          quantity: qty,
          unitCost: Number(poItem.unitPrice),
          grnId: locked.id,
          performedById: actorUserId ?? locked.receivedById ?? null,
          remarks: `GRN ${locked.grnNo}`,
          createBatch: true,
        });

        poItem.receivedQuantity = this.roundQty(
          Number(poItem.receivedQuantity) + Number(item.receivedQuantity),
        );
        await manager.save(poItem);
      }

      await this.recalculatePoReceivingStatus(manager, po);

      locked.status = GRNStatus.APPROVED;
      locked.approvedAt = new Date();
      locked.approvedById = actorUserId ?? null;
      await manager.save(locked);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'GoodsReceiptNote',
        entityId: grn.id,
        record: grn.grnNo,
        description: `Approved GRN ${grn.grnNo} and posted inventory`,
        metadata: { status: GRNStatus.APPROVED },
      },
      activity,
    );

    return this.findOne(grn.id);
  }

  private async recalculatePoReceivingStatus(
    manager: EntityManager,
    po: PurchaseOrder,
  ) {
    const items = await manager.find(PurchaseOrderItem, {
      where: { purchaseOrderId: po.id },
    });
    const productLines = items.filter(
      (item) => item.itemType === PurchaseQuotationItemType.PRODUCT,
    );

    if (!productLines.length) {
      po.receivingStatus = PurchaseOrderReceivingStatus.RECEIVED;
    } else {
      let anyReceived = false;
      let allFullyReceived = true;
      for (const item of productLines) {
        const ordered = Number(item.quantity);
        const received = Number(item.receivedQuantity);
        if (received > 0) anyReceived = true;
        if (received + 1e-9 < ordered) allFullyReceived = false;
      }
      if (!anyReceived) {
        po.receivingStatus = PurchaseOrderReceivingStatus.NOT_RECEIVED;
      } else if (allFullyReceived) {
        po.receivingStatus = PurchaseOrderReceivingStatus.RECEIVED;
      } else {
        po.receivingStatus = PurchaseOrderReceivingStatus.PARTIALLY_RECEIVED;
      }
    }
    await manager.save(po);
  }

  private async validateItemsForApprove(
    manager: EntityManager,
    po: PurchaseOrder,
    items: GoodsReceiptNoteItem[],
  ) {
    for (const item of items) {
      const poItem = (po.items ?? []).find(
        (p) => p.id === item.purchaseOrderItemId,
      );
      if (!poItem) {
        throw new BadRequestException(
          `PO item not found: ${item.purchaseOrderItemId}`,
        );
      }
      if (poItem.itemType !== PurchaseQuotationItemType.PRODUCT) {
        throw new BadRequestException(
          'Only PRODUCT lines can be received via GRN',
        );
      }
      if (!poItem.productId) {
        throw new BadRequestException(
          `PO item ${poItem.itemName} has no productId`,
        );
      }
      if (poItem.productId !== item.productId) {
        throw new BadRequestException(
          'GRN item productId does not match PO item productId',
        );
      }

      // Pending GRNs (other than this one) that are not yet approved
      // do not count — only already-posted receivedQuantity on PO item.
      const remaining =
        Number(poItem.quantity) - Number(poItem.receivedQuantity);
      if (Number(item.receivedQuantity) > remaining + 1e-9) {
        throw new BadRequestException(
          `Received qty ${item.receivedQuantity} exceeds remaining ${remaining} for ${poItem.itemName}`,
        );
      }
    }
    void manager;
  }

  // ── Helpers ────────────────────────────────────────────

  private async normalizeItems(
    po: PurchaseOrder,
    items: CreateGrnItemDto[],
    excludeGrnId?: string,
  ) {
    const seen = new Set<string>();
    const result: Array<{
      purchaseOrderItemId: string;
      productId: string;
      receivedQuantity: number;
      rejectedQuantity: number;
      remarks: string | null;
    }> = [];

    for (const dto of items) {
      if (seen.has(dto.purchaseOrderItemId)) {
        throw new BadRequestException(
          `Duplicate purchaseOrderItemId: ${dto.purchaseOrderItemId}`,
        );
      }
      seen.add(dto.purchaseOrderItemId);

      const poItem = (po.items ?? []).find(
        (p) => p.id === dto.purchaseOrderItemId,
      );
      if (!poItem) {
        throw new BadRequestException(
          `PO item not found on this order: ${dto.purchaseOrderItemId}`,
        );
      }
      if (poItem.itemType !== PurchaseQuotationItemType.PRODUCT) {
        throw new BadRequestException(
          `SERVICE line "${poItem.itemName}" cannot be received via GRN`,
        );
      }
      if (!poItem.productId) {
        throw new BadRequestException(
          `PO item "${poItem.itemName}" has no productId — cannot receive into inventory`,
        );
      }

      const receivedQuantity = this.roundQty(dto.receivedQuantity);
      const rejectedQuantity = this.roundQty(dto.rejectedQuantity ?? 0);
      this.inventoryService.toIntQty(receivedQuantity, 'receivedQuantity');

      const remaining =
        Number(poItem.quantity) - Number(poItem.receivedQuantity);
      // Also subtract other draft/pending GRN quantities for same PO item?
      // Doc: only approved GRN posts. Draft overlap is allowed but we warn
      // by checking other open GRNs to prevent over-commit.
      const openCommitted = await this.sumOpenGrnQty(
        poItem.id,
        excludeGrnId,
      );
      if (receivedQuantity + openCommitted > remaining + 1e-9) {
        throw new BadRequestException(
          `Received qty ${receivedQuantity} plus other open GRNs (${openCommitted}) exceeds remaining ${remaining} for ${poItem.itemName}`,
        );
      }

      result.push({
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        receivedQuantity,
        rejectedQuantity,
        remarks: this.nullableTrim(dto.remarks),
      });
    }

    return result;
  }

  private async validateItemAgainstPo(
    po: PurchaseOrder,
    item: GoodsReceiptNoteItem,
    grnId: string,
  ) {
    await this.normalizeItems(
      po,
      [
        {
          purchaseOrderItemId: item.purchaseOrderItemId,
          receivedQuantity: Number(item.receivedQuantity),
          rejectedQuantity: Number(item.rejectedQuantity),
          remarks: item.remarks,
        },
      ],
      grnId,
    );
  }

  private async sumOpenGrnQty(
    purchaseOrderItemId: string,
    excludeGrnId?: string,
  ): Promise<number> {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .innerJoin('item.grn', 'grn')
      .select('COALESCE(SUM(item.receivedQuantity), 0)', 'total')
      .where('item.purchaseOrderItemId = :purchaseOrderItemId', {
        purchaseOrderItemId,
      })
      .andWhere('grn.status IN (:...statuses)', {
        statuses: [GRNStatus.DRAFT, GRNStatus.PENDING_APPROVAL],
      });
    if (excludeGrnId) {
      qb.andWhere('grn.id <> :excludeGrnId', { excludeGrnId });
    }
    const raw = await qb.getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  private async ensureApprovedPo(id: string): Promise<PurchaseOrder> {
    const po = await this.poRepo.findOne({
      where: { id },
      relations: { items: true, vendor: true },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    if (po.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'GRN can only be created against an approved purchase order',
      );
    }
    return po;
  }

  private async ensureUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async findByIdOrFail(id: string): Promise<GoodsReceiptNote> {
    const grn = await this.grnRepo.findOne({
      where: { id },
      relations: {
        purchaseOrder: { vendor: true },
        receivedBy: true,
        approvedBy: true,
        items: { product: true, purchaseOrderItem: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    return grn;
  }

  private async findItemOrFail(grnId: string, itemId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, grnId },
    });
    if (!item) throw new NotFoundException('GRN item not found');
    return item;
  }

  private assertEditable(grn: GoodsReceiptNote) {
    if (grn.status !== GRNStatus.DRAFT) {
      throw new BadRequestException(`Cannot edit a ${grn.status} GRN`);
    }
  }

  private assertHasItems(grn: GoodsReceiptNote) {
    if (!grn.items?.length) {
      throw new BadRequestException('GRN must have at least one item');
    }
  }

  private async buildListSummary(query: GrnListQueryDto) {
    const qb = this.grnRepo
      .createQueryBuilder('grn')
      .leftJoin('grn.purchaseOrder', 'po')
      .leftJoin('po.vendor', 'vendor');
    this.applyListFilters(qb, query, { ignoreStatus: true });
    qb.select(
      `COALESCE(SUM(CASE WHEN grn.status = :draft THEN 1 ELSE 0 END), 0)`,
      'draftCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN grn.status = :pending THEN 1 ELSE 0 END), 0)`,
        'pendingApprovalCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN grn.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN grn.status = :rejected THEN 1 ELSE 0 END), 0)`,
        'rejectedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN grn.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(grn.id)`, 'totalCount')
      .setParameter('draft', GRNStatus.DRAFT)
      .setParameter('pending', GRNStatus.PENDING_APPROVAL)
      .setParameter('approved', GRNStatus.APPROVED)
      .setParameter('rejected', GRNStatus.REJECTED)
      .setParameter('cancelled', GRNStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();
    return {
      draftCount: Number(raw?.draftCount ?? 0),
      pendingApprovalCount: Number(raw?.pendingApprovalCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      rejectedCount: Number(raw?.rejectedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<GoodsReceiptNote>,
    query: GrnListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('grn.status = :status', { status: query.status });
    }
    if (query.purchaseOrderId) {
      qb.andWhere('grn.purchaseOrderId = :purchaseOrderId', {
        purchaseOrderId: query.purchaseOrderId,
      });
    }
    if (query.vendorId) {
      qb.andWhere('po.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          grn.grnNo ILIKE :search
          OR grn.vendorDocumentNo ILIKE :search
          OR po.purchaseOrderNo ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.ownerName ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }
    return qb;
  }

  private async generateUniqueGrnNo(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.grnRepo,
        GRN_PREFIX,
        'grnNo',
        6,
        attempt,
      );
      const existing = await this.grnRepo.findOne({ where: { grnNo: code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique GRN number');
  }

  private toResponse(grn: GoodsReceiptNote) {
    const po = grn.purchaseOrder;
    return {
      id: grn.id,
      grnNo: grn.grnNo,
      purchaseOrderId: grn.purchaseOrderId,
      receivedAt: grn.receivedAt,
      receivedById: grn.receivedById ?? null,
      vendorDocumentNo: grn.vendorDocumentNo ?? null,
      status: grn.status,
      approvedById: grn.approvedById ?? null,
      approvedAt: grn.approvedAt ?? null,
      remarks: grn.remarks ?? null,
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
      purchaseOrder: po
        ? {
            id: po.id,
            purchaseOrderNo: po.purchaseOrderNo,
            status: po.status,
            receivingStatus: po.receivingStatus,
            vendorId: po.vendorId,
            vendor: po.vendor
              ? {
                  id: po.vendor.id,
                  vendorName: po.vendor.vendorName ?? null,
                  ownerName: po.vendor.ownerName,
                }
              : null,
          }
        : null,
      receivedBy: grn.receivedBy
        ? {
            id: grn.receivedBy.id,
            name: grn.receivedBy.name,
            email: grn.receivedBy.email,
          }
        : null,
      approvedBy: grn.approvedBy
        ? {
            id: grn.approvedBy.id,
            name: grn.approvedBy.name,
            email: grn.approvedBy.email,
          }
        : null,
      items: (grn.items ?? []).map((item) => ({
        id: item.id,
        grnId: item.grnId,
        productId: item.productId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        receivedQuantity: this.formatQty(item.receivedQuantity),
        rejectedQuantity: this.formatQty(item.rejectedQuantity),
        remarks: item.remarks ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        product: item.product
          ? { id: item.product.id, name: item.product.name }
          : null,
        purchaseOrderItem: item.purchaseOrderItem
          ? {
              id: item.purchaseOrderItem.id,
              itemName: item.purchaseOrderItem.itemName,
              quantity: this.formatQty(item.purchaseOrderItem.quantity),
              receivedQuantity: this.formatQty(
                item.purchaseOrderItem.receivedQuantity,
              ),
              unitPrice: Number(item.purchaseOrderItem.unitPrice).toFixed(2),
            }
          : null,
      })),
    };
  }

  private roundQty(value: number): number {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('Invalid quantity');
    }
    return n;
  }

  private formatQty(value: number | string): string {
    return this.roundQty(Number(value)).toFixed(2);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }
}
