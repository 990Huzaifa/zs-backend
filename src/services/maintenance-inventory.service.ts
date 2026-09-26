import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AdjustMaintenanceStockDto,
  ChangeBatchStatusDto,
  MaintenanceBatchListQueryDto,
  MaintenanceStockListQueryDto,
  MaintenanceStockLogListQueryDto,
} from '../auth/dto/maintenance-inventory.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  MAINTENANCE_BATCH_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  MaintenanceBatchStatus,
  MaintenanceInventoryBatch,
  MaintenanceInventoryStock,
  MaintenanceStockLog,
  MaintenanceStockMovementType,
  MaintenanceStockReferenceType,
} from '../database/entities/maintenance/maintenance-inventory.entity';
import { VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

export type StockInParams = {
  productId: string;
  quantity: number;
  unitCost?: number | null;
  manufacturingDate?: Date | null;
  expiryDate?: Date | null;
  grnId?: string | null;
  performedById?: string | null;
  remarks?: string | null;
  /** Create a new batch (default) or omit to only bump aggregate — GRN always creates batch. */
  createBatch?: boolean;
  existingBatchId?: string | null;
};

export type StockOutParams = {
  productId: string;
  batchId: string;
  quantity: number;
  jobCardId?: string | null;
  performedById?: string | null;
  remarks?: string | null;
  referenceType?: MaintenanceStockReferenceType;
  movementType?: MaintenanceStockMovementType;
};

@Injectable()
export class MaintenanceInventoryService {
  constructor(
    @InjectRepository(MaintenanceInventoryStock)
    private readonly stockRepo: Repository<MaintenanceInventoryStock>,
    @InjectRepository(MaintenanceInventoryBatch)
    private readonly batchRepo: Repository<MaintenanceInventoryBatch>,
    @InjectRepository(MaintenanceStockLog)
    private readonly logRepo: Repository<MaintenanceStockLog>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  // ── List / read ────────────────────────────────────────

  async findAllStocks(query: MaintenanceStockListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.stockRepo
      .createQueryBuilder('stock')
      .leftJoinAndSelect('stock.product', 'product')
      .orderBy('product.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (query.productId) {
      qb.andWhere('stock.productId = :productId', {
        productId: query.productId,
      });
    }
    if (query.inStockOnly) {
      qb.andWhere(
        `(stock.quantityOnHand - stock.reservedQuantity - stock.damagedQuantity) > 0`,
      );
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) => this.toStockResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findStockByProduct(productId: string) {
    const stock = await this.stockRepo.findOne({
      where: { productId },
      relations: { product: true },
    });
    if (!stock) {
      throw new NotFoundException('Maintenance inventory stock not found');
    }
    return this.toStockResponse(stock);
  }

  async findAllBatches(query: MaintenanceBatchListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product')
      .leftJoinAndSelect('batch.grn', 'grn')
      .orderBy('batch.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.productId) {
      qb.andWhere('batch.productId = :productId', {
        productId: query.productId,
      });
    }
    if (query.status) {
      qb.andWhere('batch.status = :status', { status: query.status });
    }
    if (query.grnId) {
      qb.andWhere('batch.grnId = :grnId', { grnId: query.grnId });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(batch.batchNo ILIKE :search OR product.name ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) => this.toBatchResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findBatch(id: string) {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: { product: true, grn: true },
    });
    if (!batch) {
      throw new NotFoundException('Maintenance inventory batch not found');
    }
    return this.toBatchResponse(batch);
  }

  async findAllLogs(query: MaintenanceStockLogListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.product', 'product')
      .leftJoinAndSelect('log.batch', 'batch')
      .leftJoinAndSelect('log.performedBy', 'performedBy')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.productId) {
      qb.andWhere('log.productId = :productId', { productId: query.productId });
    }
    if (query.batchId) {
      qb.andWhere('log.batchId = :batchId', { batchId: query.batchId });
    }
    if (query.grnId) {
      qb.andWhere('log.grnId = :grnId', { grnId: query.grnId });
    }
    if (query.jobCardId) {
      qb.andWhere('log.jobCardId = :jobCardId', {
        jobCardId: query.jobCardId,
      });
    }
    if (query.movementType) {
      qb.andWhere('log.movementType = :movementType', {
        movementType: query.movementType,
      });
    }
    if (query.referenceType) {
      qb.andWhere('log.referenceType = :referenceType', {
        referenceType: query.referenceType,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) => this.toLogResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async changeBatchStatus(
    id: string,
    dto: ChangeBatchStatusDto,
    activity?: ActivityActorContext,
  ) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Maintenance inventory batch not found');
    }

    if (
      dto.status === MaintenanceBatchStatus.DEPLETED &&
      Number(batch.availableQuantity) > 0
    ) {
      throw new BadRequestException(
        'Cannot mark batch depleted while availableQuantity > 0',
      );
    }
    if (
      dto.status === MaintenanceBatchStatus.ACTIVE &&
      Number(batch.availableQuantity) <= 0
    ) {
      throw new BadRequestException(
        'Cannot activate a batch with zero available quantity',
      );
    }

    batch.status = dto.status;
    await this.batchRepo.save(batch);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceInventoryBatch',
        entityId: batch.id,
        record: batch.batchNo,
        description: `Changed batch ${batch.batchNo} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findBatch(id);
  }

  /**
   * Manual adjustment IN/OUT. Creates a batch for ADJUSTMENT_IN when no batchId.
   */
  async adjustStock(
    dto: AdjustMaintenanceStockDto,
    activity?: ActivityActorContext,
    performedById?: string,
  ) {
    await this.ensureProduct(dto.productId);
    const qty = this.toIntQty(dto.quantity, 'quantity');

    const result = await this.dataSource.transaction(async (manager) => {
      if (dto.movementType === MaintenanceStockMovementType.ADJUSTMENT_IN) {
        return this.postStockIn(manager, {
          productId: dto.productId,
          quantity: qty,
          unitCost: dto.unitCost ?? null,
          manufacturingDate: dto.manufacturingDate
            ? new Date(dto.manufacturingDate)
            : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          performedById: performedById ?? null,
          remarks: dto.remarks?.trim() || null,
          createBatch: true,
          existingBatchId: dto.batchId ?? null,
          movementType: MaintenanceStockMovementType.ADJUSTMENT_IN,
          referenceType: MaintenanceStockReferenceType.ADJUSTMENT,
        });
      }

      if (!dto.batchId) {
        throw new BadRequestException(
          'batchId is required for adjustment_out',
        );
      }
      return this.postStockOut(manager, {
        productId: dto.productId,
        batchId: dto.batchId,
        quantity: qty,
        performedById: performedById ?? null,
        remarks: dto.remarks?.trim() || null,
        referenceType: MaintenanceStockReferenceType.ADJUSTMENT,
        movementType: MaintenanceStockMovementType.ADJUSTMENT_OUT,
      });
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'MaintenanceInventoryStock',
        entityId: result.stock.id,
        record: dto.productId,
        description: `Stock ${dto.movementType} qty ${qty} for product ${dto.productId}`,
        metadata: {
          movementType: dto.movementType,
          quantity: qty,
          batchId: result.batch?.id ?? dto.batchId,
        },
      },
      activity,
    );

    return {
      stock: this.toStockResponse(result.stock),
      batch: result.batch ? this.toBatchResponse(result.batch) : null,
      log: this.toLogResponse(result.log),
    };
  }

  // ── Transactional posting (used by GRN / Stock Issue) ──

  async postStockIn(
    manager: EntityManager,
    params: StockInParams & {
      movementType?: MaintenanceStockMovementType;
      referenceType?: MaintenanceStockReferenceType;
    },
  ) {
    const qty = this.toIntQty(params.quantity, 'quantity');
    if (qty <= 0) {
      throw new BadRequestException('Stock IN quantity must be > 0');
    }

    const stock = await this.lockOrCreateStock(manager, params.productId);
    const quantityBefore = Number(stock.quantityOnHand);

    let batch: MaintenanceInventoryBatch | null = null;

    if (params.existingBatchId) {
      batch = await manager.findOne(MaintenanceInventoryBatch, {
        where: { id: params.existingBatchId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) {
        throw new NotFoundException('Batch not found for stock IN');
      }
      if (batch.productId !== params.productId) {
        throw new BadRequestException('Batch product mismatch');
      }
      if (batch.status === MaintenanceBatchStatus.BLOCKED) {
        throw new BadRequestException('Cannot add stock to a blocked batch');
      }
      batch.availableQuantity = Number(batch.availableQuantity) + qty;
      batch.receivedQuantity = Number(batch.receivedQuantity) + qty;
      if (batch.status === MaintenanceBatchStatus.DEPLETED) {
        batch.status = MaintenanceBatchStatus.ACTIVE;
      }
      await manager.save(batch);
    } else if (params.createBatch !== false) {
      const batchNo = await this.generateUniqueBatchNo(manager);
      batch = await manager.save(
        manager.create(MaintenanceInventoryBatch, {
          productId: params.productId,
          batchNo,
          receivedQuantity: qty,
          availableQuantity: qty,
          unitCost: params.unitCost ?? null,
          manufacturingDate: params.manufacturingDate ?? null,
          expiryDate: params.expiryDate ?? null,
          status: MaintenanceBatchStatus.ACTIVE,
          grnId: params.grnId ?? null,
        }),
      );
    }

    stock.quantityOnHand = quantityBefore + qty;
    await manager.save(stock);

    const log = await manager.save(
      manager.create(MaintenanceStockLog, {
        productId: params.productId,
        batchId: batch?.id ?? null,
        movementType:
          params.movementType ?? MaintenanceStockMovementType.IN,
        referenceType:
          params.referenceType ?? MaintenanceStockReferenceType.GRN,
        quantity: qty,
        quantityBefore,
        quantityAfter: stock.quantityOnHand,
        grnId: params.grnId ?? null,
        jobCardId: null,
        performedById: params.performedById ?? null,
        remarks: params.remarks ?? null,
      }),
    );

    return { stock, batch, log };
  }

  async postStockOut(manager: EntityManager, params: StockOutParams) {
    const qty = this.toIntQty(params.quantity, 'quantity');
    if (qty <= 0) {
      throw new BadRequestException('Stock OUT quantity must be > 0');
    }

    const batch = await manager.findOne(MaintenanceInventoryBatch, {
      where: { id: params.batchId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found for stock OUT');
    }
    if (batch.productId !== params.productId) {
      throw new BadRequestException('Batch product mismatch');
    }
    if (batch.status === MaintenanceBatchStatus.BLOCKED) {
      throw new BadRequestException('Cannot issue from a blocked batch');
    }
    if (Number(batch.availableQuantity) < qty) {
      throw new BadRequestException(
        `Insufficient batch quantity (available ${batch.availableQuantity}, requested ${qty})`,
      );
    }

    const stock = await this.lockOrCreateStock(manager, params.productId);
    const available =
      Number(stock.quantityOnHand) -
      Number(stock.reservedQuantity) -
      Number(stock.damagedQuantity);
    if (available < qty) {
      throw new BadRequestException(
        `Insufficient stock available (available ${available}, requested ${qty})`,
      );
    }

    const quantityBefore = Number(stock.quantityOnHand);

    batch.availableQuantity = Number(batch.availableQuantity) - qty;
    if (batch.availableQuantity <= 0) {
      batch.availableQuantity = 0;
      batch.status = MaintenanceBatchStatus.DEPLETED;
    }
    await manager.save(batch);

    stock.quantityOnHand = quantityBefore - qty;
    await manager.save(stock);

    const log = await manager.save(
      manager.create(MaintenanceStockLog, {
        productId: params.productId,
        batchId: batch.id,
        movementType:
          params.movementType ?? MaintenanceStockMovementType.OUT,
        referenceType:
          params.referenceType ?? MaintenanceStockReferenceType.JOB_CARD,
        quantity: qty,
        quantityBefore,
        quantityAfter: stock.quantityOnHand,
        grnId: null,
        jobCardId: params.jobCardId ?? null,
        performedById: params.performedById ?? null,
        remarks: params.remarks ?? null,
      }),
    );

    return { stock, batch, log };
  }

  // ── Helpers ────────────────────────────────────────────

  private async lockOrCreateStock(
    manager: EntityManager,
    productId: string,
  ): Promise<MaintenanceInventoryStock> {
    let stock = await manager.findOne(MaintenanceInventoryStock, {
      where: { productId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stock) {
      await manager.insert(MaintenanceInventoryStock, {
        productId,
        quantityOnHand: 0,
        reservedQuantity: 0,
        damagedQuantity: 0,
      });
      stock = await manager.findOne(MaintenanceInventoryStock, {
        where: { productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stock) {
        throw new BadRequestException('Could not create inventory stock row');
      }
    }
    return stock;
  }

  private async generateUniqueBatchNo(manager: EntityManager): Promise<string> {
    const repo = manager.getRepository(MaintenanceInventoryBatch);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        MAINTENANCE_BATCH_PREFIX,
        'batchNo',
        6,
        attempt,
      );
      const existing = await repo.findOne({ where: { batchNo: code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique batch number');
  }

  private async ensureProduct(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Inventory qty columns are integers — reject fractional values. */
  toIntQty(value: number, field = 'quantity'): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) > 1e-9) {
      throw new BadRequestException(
        `${field} must be a whole number for inventory operations`,
      );
    }
    return rounded;
  }

  toStockResponse(stock: MaintenanceInventoryStock) {
    const onHand = Number(stock.quantityOnHand);
    const reserved = Number(stock.reservedQuantity);
    const damaged = Number(stock.damagedQuantity);
    return {
      id: stock.id,
      productId: stock.productId,
      quantityOnHand: onHand,
      reservedQuantity: reserved,
      damagedQuantity: damaged,
      availableQuantity: onHand - reserved - damaged,
      createdAt: stock.createdAt,
      updatedAt: stock.updatedAt,
      product: stock.product
        ? { id: stock.product.id, name: stock.product.name }
        : null,
    };
  }

  toBatchResponse(batch: MaintenanceInventoryBatch) {
    return {
      id: batch.id,
      productId: batch.productId,
      batchNo: batch.batchNo,
      receivedQuantity: Number(batch.receivedQuantity),
      availableQuantity: Number(batch.availableQuantity),
      unitCost:
        batch.unitCost !== null && batch.unitCost !== undefined
          ? Number(batch.unitCost).toFixed(2)
          : null,
      manufacturingDate: batch.manufacturingDate ?? null,
      expiryDate: batch.expiryDate ?? null,
      status: batch.status,
      grnId: batch.grnId ?? null,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      product: batch.product
        ? { id: batch.product.id, name: batch.product.name }
        : null,
      grn: batch.grn
        ? { id: batch.grn.id, grnNo: batch.grn.grnNo, status: batch.grn.status }
        : null,
    };
  }

  toLogResponse(log: MaintenanceStockLog) {
    return {
      id: log.id,
      productId: log.productId,
      batchId: log.batchId ?? null,
      movementType: log.movementType,
      referenceType: log.referenceType,
      quantity: Number(log.quantity),
      quantityBefore: Number(log.quantityBefore),
      quantityAfter: Number(log.quantityAfter),
      grnId: log.grnId ?? null,
      jobCardId: log.jobCardId ?? null,
      performedById: log.performedById ?? null,
      remarks: log.remarks ?? null,
      createdAt: log.createdAt,
      product: log.product
        ? { id: log.product.id, name: log.product.name }
        : null,
      batch: log.batch
        ? {
            id: log.batch.id,
            batchNo: log.batch.batchNo,
            status: log.batch.status,
          }
        : null,
      performedBy: log.performedBy
        ? {
            id: log.performedBy.id,
            name: log.performedBy.name,
            email: log.performedBy.email,
          }
        : null,
    };
  }
}
