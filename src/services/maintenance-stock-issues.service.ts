import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeMaintenanceStockIssueStatusDto,
  CreateMaintenanceStockIssueDto,
  CreateMaintenanceStockIssueItemDto,
  MaintenanceStockIssueListQueryDto,
  ReplaceMaintenanceStockIssueItemsDto,
  UpdateMaintenanceStockIssueDto,
  UpdateMaintenanceStockIssueItemDto,
} from '../auth/dto/maintenance-stock-issue.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  MAINTENANCE_STOCK_ISSUE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { JobCard } from '../database/entities/maintenance/jobcard.entity';
import {
  MaintenanceBatchStatus,
  MaintenanceInventoryBatch,
} from '../database/entities/maintenance/maintenance-inventory.entity';
import {
  MaintenanceStockIssue,
  MaintenanceStockIssueItem,
  MaintenanceStockIssueStatus,
} from '../database/entities/maintenance/maintenance-stock-issue.entity';
import { User } from '../database/entities/user.entity';
import { VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';
import { MaintenanceInventoryService } from './maintenance-inventory.service';

const STATUS_TRANSITIONS: Record<
  MaintenanceStockIssueStatus,
  MaintenanceStockIssueStatus[]
> = {
  [MaintenanceStockIssueStatus.DRAFT]: [
    MaintenanceStockIssueStatus.PENDING_APPROVAL,
    MaintenanceStockIssueStatus.CANCELLED,
  ],
  [MaintenanceStockIssueStatus.PENDING_APPROVAL]: [
    MaintenanceStockIssueStatus.APPROVED,
    MaintenanceStockIssueStatus.CANCELLED,
  ],
  [MaintenanceStockIssueStatus.APPROVED]: [],
  [MaintenanceStockIssueStatus.CANCELLED]: [],
};

@Injectable()
export class MaintenanceStockIssuesService {
  constructor(
    @InjectRepository(MaintenanceStockIssue)
    private readonly issueRepo: Repository<MaintenanceStockIssue>,
    @InjectRepository(MaintenanceStockIssueItem)
    private readonly itemRepo: Repository<MaintenanceStockIssueItem>,
    @InjectRepository(JobCard)
    private readonly jobCardRepo: Repository<JobCard>,
    @InjectRepository(MaintenanceInventoryBatch)
    private readonly batchRepo: Repository<MaintenanceInventoryBatch>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: MaintenanceInventoryService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateMaintenanceStockIssueDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureJobCard(dto.jobCardId);
    if (dto.issuedById) await this.ensureUser(dto.issuedById);

    const status = dto.status ?? MaintenanceStockIssueStatus.DRAFT;
    if (
      status !== MaintenanceStockIssueStatus.DRAFT &&
      status !== MaintenanceStockIssueStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        'Create status must be draft or pending_approval',
      );
    }

    const normalized = await this.normalizeItems(dto.items);
    const issueNo = await this.generateUniqueIssueNo();

    const saved = await this.issueRepo.save(
      this.issueRepo.create({
        issueNo,
        jobCardId: dto.jobCardId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        issuedById: dto.issuedById ?? null,
        status,
        remarks: this.nullableTrim(dto.remarks),
      }),
    );

    await this.itemRepo.save(
      normalized.map((item) =>
        this.itemRepo.create({
          stockIssueId: saved.id,
          productId: item.productId,
          batchId: item.batchId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          remarks: item.remarks,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: saved.id,
        record: saved.issueNo,
        description: `Created stock issue ${saved.issueNo}`,
        metadata: {
          status,
          jobCardId: dto.jobCardId,
          itemCount: normalized.length,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: MaintenanceStockIssueListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.issueRepo
      .createQueryBuilder('msi')
      .leftJoinAndSelect('msi.jobCard', 'jobCard')
      .leftJoinAndSelect('msi.issuedBy', 'issuedBy')
      .leftJoinAndSelect('msi.approvedBy', 'approvedBy')
      .leftJoinAndSelect('msi.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.batch', 'batch')
      .orderBy('msi.createdAt', 'DESC')
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
    dto: UpdateMaintenanceStockIssueDto,
    activity?: ActivityActorContext,
  ) {
    const issue = await this.findByIdOrFail(id);
    this.assertEditable(issue);

    if (dto.issueDate !== undefined) {
      issue.issueDate = new Date(dto.issueDate);
    }
    if (dto.issuedById !== undefined) {
      if (dto.issuedById) await this.ensureUser(dto.issuedById);
      issue.issuedById = dto.issuedById;
    }
    if (dto.remarks !== undefined) {
      issue.remarks = this.nullableTrim(dto.remarks);
    }

    await this.issueRepo.save(issue);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: issue.id,
        record: issue.issueNo,
        description: `Updated stock issue ${issue.issueNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeMaintenanceStockIssueStatusDto,
    activity?: ActivityActorContext,
    actorUserId?: string,
  ) {
    const issue = await this.findByIdOrFail(id);
    const next = dto.status;

    if (issue.status === next) {
      return this.toResponse(issue);
    }

    const allowed = STATUS_TRANSITIONS[issue.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${issue.status} to ${next}`,
      );
    }

    if (next === MaintenanceStockIssueStatus.PENDING_APPROVAL) {
      this.assertHasItems(issue);
    }

    if (next === MaintenanceStockIssueStatus.APPROVED) {
      return this.approveIssue(issue, activity, actorUserId);
    }

    issue.status = next;
    if (next === MaintenanceStockIssueStatus.CANCELLED) {
      issue.approvedAt = null;
      issue.approvedById = null;
    }
    await this.issueRepo.save(issue);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: issue.id,
        record: issue.issueNo,
        description: `Changed stock issue ${issue.issueNo} status to ${next}`,
        metadata: { status: next },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const issue = await this.findByIdOrFail(id);
    if (
      issue.status !== MaintenanceStockIssueStatus.DRAFT &&
      issue.status !== MaintenanceStockIssueStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled stock issues can be deleted',
      );
    }

    const { issueNo } = issue;
    await this.issueRepo.remove(issue);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: id,
        record: issueNo,
        description: `Deleted stock issue ${issueNo}`,
      },
      activity,
    );

    return { id, issueNo, deleted: true };
  }

  // ── Items ──────────────────────────────────────────────

  async replaceItems(
    id: string,
    dto: ReplaceMaintenanceStockIssueItemsDto,
    activity?: ActivityActorContext,
  ) {
    const issue = await this.findByIdOrFail(id);
    this.assertEditable(issue);
    const normalized = await this.normalizeItems(dto.items);

    await this.itemRepo.delete({ stockIssueId: id });
    await this.itemRepo.save(
      normalized.map((item) =>
        this.itemRepo.create({
          stockIssueId: id,
          productId: item.productId,
          batchId: item.batchId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          remarks: item.remarks,
        }),
      ),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: id,
        record: issue.issueNo,
        description: `Replaced items on stock issue ${issue.issueNo}`,
        metadata: { itemCount: normalized.length },
      },
      activity,
    );

    return this.findOne(id);
  }

  async updateItem(
    issueId: string,
    itemId: string,
    dto: UpdateMaintenanceStockIssueItemDto,
    activity?: ActivityActorContext,
  ) {
    const issue = await this.findByIdOrFail(issueId);
    this.assertEditable(issue);
    const item = await this.findItemOrFail(issueId, itemId);

    if (dto.productId !== undefined) item.productId = dto.productId;
    if (dto.batchId !== undefined) item.batchId = dto.batchId;
    if (dto.quantity !== undefined) {
      item.quantity = this.roundQty(dto.quantity);
    }
    if (dto.remarks !== undefined) {
      item.remarks = this.nullableTrim(dto.remarks);
    }

    const [normalized] = await this.normalizeItems([
      {
        productId: item.productId,
        batchId: item.batchId,
        quantity: Number(item.quantity),
        remarks: item.remarks,
      },
    ]);
    item.unitCost = normalized.unitCost;
    item.totalCost = normalized.totalCost;
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssueItem',
        entityId: item.id,
        record: issue.issueNo,
        description: `Updated item on stock issue ${issue.issueNo}`,
      },
      activity,
    );

    return this.findOne(issueId);
  }

  async removeItem(
    issueId: string,
    itemId: string,
    activity?: ActivityActorContext,
  ) {
    const issue = await this.findByIdOrFail(issueId);
    this.assertEditable(issue);
    const item = await this.findItemOrFail(issueId, itemId);
    await this.itemRepo.remove(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssueItem',
        entityId: itemId,
        record: issue.issueNo,
        description: `Removed item from stock issue ${issue.issueNo}`,
      },
      activity,
    );

    return this.findOne(issueId);
  }

  // ── Approve + consume stock ────────────────────────────

  private async approveIssue(
    issue: MaintenanceStockIssue,
    activity?: ActivityActorContext,
    actorUserId?: string,
  ) {
    this.assertHasItems(issue);

    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(MaintenanceStockIssue, {
        where: { id: issue.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Stock issue not found');
      if (locked.status === MaintenanceStockIssueStatus.APPROVED) return;
      if (locked.status !== MaintenanceStockIssueStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `Cannot approve stock issue in status ${locked.status}`,
        );
      }

      const items = await manager.find(MaintenanceStockIssueItem, {
        where: { stockIssueId: locked.id },
      });
      if (!items.length) {
        throw new BadRequestException('Stock issue must have at least one item');
      }

      for (const item of items) {
        const qty = this.inventoryService.toIntQty(
          Number(item.quantity),
          'quantity',
        );

        const batch = await manager.findOne(MaintenanceInventoryBatch, {
          where: { id: item.batchId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!batch) {
          throw new NotFoundException(`Batch not found: ${item.batchId}`);
        }

        const unitCost =
          item.unitCost !== null && item.unitCost !== undefined
            ? Number(item.unitCost)
            : batch.unitCost !== null && batch.unitCost !== undefined
              ? Number(batch.unitCost)
              : null;
        item.unitCost = unitCost;
        item.totalCost =
          unitCost !== null
            ? Math.round(unitCost * qty * 100) / 100
            : null;
        await manager.save(item);

        await this.inventoryService.postStockOut(manager, {
          productId: item.productId,
          batchId: item.batchId,
          quantity: qty,
          jobCardId: locked.jobCardId,
          performedById: actorUserId ?? locked.issuedById ?? null,
          remarks: `Stock issue ${locked.issueNo}`,
        });
      }

      locked.status = MaintenanceStockIssueStatus.APPROVED;
      locked.approvedAt = new Date();
      locked.approvedById = actorUserId ?? null;
      await manager.save(locked);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceStockIssue',
        entityId: issue.id,
        record: issue.issueNo,
        description: `Approved stock issue ${issue.issueNo} and posted inventory OUT`,
        metadata: { status: MaintenanceStockIssueStatus.APPROVED },
      },
      activity,
    );

    return this.findOne(issue.id);
  }

  // ── Helpers ────────────────────────────────────────────

  private async normalizeItems(items: CreateMaintenanceStockIssueItemDto[]) {
    const result: Array<{
      productId: string;
      batchId: string;
      quantity: number;
      unitCost: number | null;
      totalCost: number | null;
      remarks: string | null;
    }> = [];

    for (const dto of items) {
      const product = await this.productRepo.findOne({
        where: { id: dto.productId },
      });
      if (!product) {
        throw new NotFoundException(`Product not found: ${dto.productId}`);
      }

      const batch = await this.batchRepo.findOne({
        where: { id: dto.batchId },
      });
      if (!batch) {
        throw new NotFoundException(`Batch not found: ${dto.batchId}`);
      }
      if (batch.productId !== dto.productId) {
        throw new BadRequestException(
          'batchId does not belong to the given productId',
        );
      }
      if (batch.status === MaintenanceBatchStatus.BLOCKED) {
        throw new BadRequestException(
          `Batch ${batch.batchNo} is blocked and cannot be issued`,
        );
      }
      if (batch.status === MaintenanceBatchStatus.DEPLETED) {
        throw new BadRequestException(
          `Batch ${batch.batchNo} is depleted`,
        );
      }

      const quantity = this.roundQty(dto.quantity);
      this.inventoryService.toIntQty(quantity, 'quantity');

      if (Number(batch.availableQuantity) < quantity) {
        throw new BadRequestException(
          `Insufficient batch ${batch.batchNo} quantity (available ${batch.availableQuantity}, requested ${quantity})`,
        );
      }

      const unitCost =
        batch.unitCost !== null && batch.unitCost !== undefined
          ? Number(batch.unitCost)
          : null;
      const totalCost =
        unitCost !== null
          ? Math.round(unitCost * quantity * 100) / 100
          : null;

      result.push({
        productId: dto.productId,
        batchId: dto.batchId,
        quantity,
        unitCost,
        totalCost,
        remarks: this.nullableTrim(dto.remarks),
      });
    }

    return result;
  }

  private async ensureJobCard(id: string) {
    const jobCard = await this.jobCardRepo.findOne({ where: { id } });
    if (!jobCard) throw new NotFoundException('Job card not found');
    return jobCard;
  }

  private async ensureUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async findByIdOrFail(id: string): Promise<MaintenanceStockIssue> {
    const issue = await this.issueRepo.findOne({
      where: { id },
      relations: {
        jobCard: true,
        issuedBy: true,
        approvedBy: true,
        items: { product: true, batch: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!issue) throw new NotFoundException('Stock issue not found');
    return issue;
  }

  private async findItemOrFail(stockIssueId: string, itemId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, stockIssueId },
    });
    if (!item) throw new NotFoundException('Stock issue item not found');
    return item;
  }

  private assertEditable(issue: MaintenanceStockIssue) {
    if (issue.status !== MaintenanceStockIssueStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a ${issue.status} stock issue`,
      );
    }
  }

  private assertHasItems(issue: MaintenanceStockIssue) {
    if (!issue.items?.length) {
      throw new BadRequestException('Stock issue must have at least one item');
    }
  }

  private async buildListSummary(query: MaintenanceStockIssueListQueryDto) {
    const qb = this.issueRepo
      .createQueryBuilder('msi')
      .leftJoin('msi.jobCard', 'jobCard');
    this.applyListFilters(qb, query, { ignoreStatus: true });
    qb.select(
      `COALESCE(SUM(CASE WHEN msi.status = :draft THEN 1 ELSE 0 END), 0)`,
      'draftCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN msi.status = :pending THEN 1 ELSE 0 END), 0)`,
        'pendingApprovalCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN msi.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN msi.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(msi.id)`, 'totalCount')
      .setParameter('draft', MaintenanceStockIssueStatus.DRAFT)
      .setParameter('pending', MaintenanceStockIssueStatus.PENDING_APPROVAL)
      .setParameter('approved', MaintenanceStockIssueStatus.APPROVED)
      .setParameter('cancelled', MaintenanceStockIssueStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();
    return {
      draftCount: Number(raw?.draftCount ?? 0),
      pendingApprovalCount: Number(raw?.pendingApprovalCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<MaintenanceStockIssue>,
    query: MaintenanceStockIssueListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('msi.status = :status', { status: query.status });
    }
    if (query.jobCardId) {
      qb.andWhere('msi.jobCardId = :jobCardId', {
        jobCardId: query.jobCardId,
      });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          msi.issueNo ILIKE :search
          OR msi.remarks ILIKE :search
          OR jobCard.jobCardNo ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }
    return qb;
  }

  private async generateUniqueIssueNo(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.issueRepo,
        MAINTENANCE_STOCK_ISSUE_PREFIX,
        'issueNo',
        6,
        attempt,
      );
      const existing = await this.issueRepo.findOne({
        where: { issueNo: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique issue number');
  }

  private toResponse(issue: MaintenanceStockIssue) {
    return {
      id: issue.id,
      issueNo: issue.issueNo,
      jobCardId: issue.jobCardId,
      issueDate: issue.issueDate,
      issuedById: issue.issuedById ?? null,
      status: issue.status,
      approvedById: issue.approvedById ?? null,
      approvedAt: issue.approvedAt ?? null,
      remarks: issue.remarks ?? null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      jobCard: issue.jobCard
        ? {
            id: issue.jobCard.id,
            jobCardNo: issue.jobCard.jobCardNo,
            jobCardTitle: issue.jobCard.jobCardTitle,
            status: issue.jobCard.status,
          }
        : null,
      issuedBy: issue.issuedBy
        ? {
            id: issue.issuedBy.id,
            name: issue.issuedBy.name,
            email: issue.issuedBy.email,
          }
        : null,
      approvedBy: issue.approvedBy
        ? {
            id: issue.approvedBy.id,
            name: issue.approvedBy.name,
            email: issue.approvedBy.email,
          }
        : null,
      items: (issue.items ?? []).map((item) => ({
        id: item.id,
        stockIssueId: item.stockIssueId,
        productId: item.productId,
        batchId: item.batchId,
        quantity: this.formatQty(item.quantity),
        unitCost:
          item.unitCost !== null && item.unitCost !== undefined
            ? Number(item.unitCost).toFixed(2)
            : null,
        totalCost:
          item.totalCost !== null && item.totalCost !== undefined
            ? Number(item.totalCost).toFixed(2)
            : null,
        remarks: item.remarks ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        product: item.product
          ? { id: item.product.id, name: item.product.name }
          : null,
        batch: item.batch
          ? {
              id: item.batch.id,
              batchNo: item.batch.batchNo,
              availableQuantity: Number(item.batch.availableQuantity),
              status: item.batch.status,
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
