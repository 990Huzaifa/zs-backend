import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CreateDeliveryChallanDto,
  CreateDeliveryChallanItemDto,
  DeliveryChallanListQueryDto,
  UpdateDeliveryChallanDto,
} from '../auth/dto/delivery-challan.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  DELIVERY_CHALLAN_PAD,
  DELIVERY_CHALLAN_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Driver } from '../database/entities/driver.entity';
import { Shop } from '../database/entities/shop.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import {
  DeliveryChallan,
  DeliveryChallanItem,
  DeliveryChallanStatus,
} from '../database/entities/warehousing/delivery-challan.entity';
import {
  InventoryLog,
  PrimaryInventory,
} from '../database/entities/warehousing/inventory.entity';
import { ActivitiesService } from './activities.service';

const STATUS_TRANSITIONS: Record<
  DeliveryChallanStatus,
  DeliveryChallanStatus[]
> = {
  [DeliveryChallanStatus.PENDING]: [
    DeliveryChallanStatus.APPROVED,
    DeliveryChallanStatus.CANCELLED,
  ],
  [DeliveryChallanStatus.APPROVED]: [
    DeliveryChallanStatus.COMPLETED,
    DeliveryChallanStatus.CANCELLED,
  ],
  [DeliveryChallanStatus.COMPLETED]: [],
  [DeliveryChallanStatus.CANCELLED]: [],
};

@Injectable()
export class DeliveryChallansService {
  constructor(
    @InjectRepository(DeliveryChallan)
    private readonly challanRepo: Repository<DeliveryChallan>,
    @InjectRepository(DeliveryChallanItem)
    private readonly itemRepo: Repository<DeliveryChallanItem>,
    @InjectRepository(PrimaryInventory)
    private readonly primaryRepo: Repository<PrimaryInventory>,
    @InjectRepository(InventoryLog)
    private readonly logRepo: Repository<InventoryLog>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateDeliveryChallanDto, activity?: ActivityActorContext) {
    await this.ensurePrimary(dto.primaryInventoryId);
    await this.ensureShop(dto.shopId);
    await this.ensureDriver(dto.driverId);
    await this.ensureVehicle(dto.vehicleId);

    const normalized = await this.normalizeItems(
      dto.items,
      dto.primaryInventoryId,
      dto.shopId,
    );
    const totals = this.computeTotals(normalized);

    const saved = await this.dataSource.transaction(async (manager) => {
      const challanRepo = manager.getRepository(DeliveryChallan);
      const itemRepo = manager.getRepository(DeliveryChallanItem);
      const challanNo = await this.generateUniqueChallanNo(challanRepo);

      const challan = await challanRepo.save(
        challanRepo.create({
          challanNo,
          challanDateTime: dto.challanDateTime
            ? new Date(dto.challanDateTime)
            : new Date(),
          primaryInventoryId: dto.primaryInventoryId,
          shopId: dto.shopId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          totalInvoices: totals.totalInvoices,
          totalCartons: totals.totalCartons,
          totalPairs: totals.totalPairs,
          status: DeliveryChallanStatus.PENDING,
        }),
      );

      await itemRepo.save(
        normalized.map((item) =>
          itemRepo.create({
            deliveryChallanId: challan.id,
            inventoryId: item.inventoryId,
            noOfCartons: item.noOfCartons,
            noOfPairs: item.noOfPairs,
            remarks: item.remarks,
          }),
        ),
      );

      return challan;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'DeliveryChallan',
        entityId: saved.id,
        record: saved.challanNo,
        description: `Created delivery challan ${saved.challanNo}`,
        metadata: {
          shopId: saved.shopId,
          primaryInventoryId: saved.primaryInventoryId,
          itemCount: totals.totalInvoices,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: DeliveryChallanListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.challanRepo
      .createQueryBuilder('dc')
      .leftJoinAndSelect('dc.shop', 'shop')
      .leftJoinAndSelect('dc.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .leftJoinAndSelect('dc.vehicle', 'vehicle')
      .leftJoinAndSelect('dc.primaryInventory', 'primaryInventory')
      .leftJoinAndSelect('primaryInventory.bilty', 'bilty')
      .leftJoinAndSelect('dc.items', 'items')
      .leftJoinAndSelect('items.inventory', 'inventory')
      .orderBy('dc.challanDateTime', 'DESC')
      .addOrderBy('dc.createdAt', 'DESC')
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
    dto: UpdateDeliveryChallanDto,
    activity?: ActivityActorContext,
  ) {
    const challan = await this.findByIdOrFail(id);
    this.assertEditable(challan);

    if (dto.shopId !== undefined) {
      await this.ensureShop(dto.shopId);
      challan.shopId = dto.shopId;
    }
    if (dto.driverId !== undefined) {
      await this.ensureDriver(dto.driverId);
      challan.driverId = dto.driverId;
    }
    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      challan.vehicleId = dto.vehicleId;
    }
    if (dto.challanDateTime !== undefined) {
      challan.challanDateTime = new Date(dto.challanDateTime);
    }

    await this.dataSource.transaction(async (manager) => {
      const challanRepo = manager.getRepository(DeliveryChallan);
      const itemRepo = manager.getRepository(DeliveryChallanItem);

      if (dto.items !== undefined) {
        const normalized = await this.normalizeItems(
          dto.items,
          challan.primaryInventoryId,
          challan.shopId,
        );
        const totals = this.computeTotals(normalized);

        await itemRepo.delete({ deliveryChallanId: challan.id });
        await itemRepo.save(
          normalized.map((item) =>
            itemRepo.create({
              deliveryChallanId: challan.id,
              inventoryId: item.inventoryId,
              noOfCartons: item.noOfCartons,
              noOfPairs: item.noOfPairs,
              remarks: item.remarks,
            }),
          ),
        );

        challan.totalInvoices = totals.totalInvoices;
        challan.totalCartons = totals.totalCartons;
        challan.totalPairs = totals.totalPairs;
      }

      await challanRepo.save(challan);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'DeliveryChallan',
        entityId: challan.id,
        record: challan.challanNo,
        description: `Updated delivery challan ${challan.challanNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: { status: DeliveryChallanStatus },
    activity?: ActivityActorContext,
  ) {
    const challan = await this.findByIdOrFail(id);
    const next = dto.status;

    if (challan.status === next) {
      return this.toResponse(challan);
    }

    const allowed = STATUS_TRANSITIONS[challan.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${challan.status} to ${next}`,
      );
    }

    if (
      next === DeliveryChallanStatus.APPROVED ||
      next === DeliveryChallanStatus.COMPLETED
    ) {
      if (!challan.items?.length) {
        throw new BadRequestException(
          'Delivery challan must have at least one item',
        );
      }
    }

    challan.status = next;
    await this.challanRepo.save(challan);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'DeliveryChallan',
        entityId: challan.id,
        record: challan.challanNo,
        description: `Changed delivery challan ${challan.challanNo} status to ${next}`,
        metadata: { status: next },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const challan = await this.findByIdOrFail(id);
    if (
      challan.status !== DeliveryChallanStatus.PENDING &&
      challan.status !== DeliveryChallanStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only pending or cancelled delivery challans can be deleted',
      );
    }

    const { challanNo } = challan;
    await this.challanRepo.remove(challan);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'DeliveryChallan',
        entityId: id,
        record: challanNo,
        description: `Deleted delivery challan ${challanNo}`,
      },
      activity,
    );

    return { message: 'Delivery challan deleted' };
  }

  private async buildListSummary(query: DeliveryChallanListQueryDto) {
    const qb = this.challanRepo
      .createQueryBuilder('dc')
      .leftJoin('dc.shop', 'shop')
      .leftJoin('dc.driver', 'driver')
      .leftJoin('driver.user', 'driverUser')
      .leftJoin('dc.vehicle', 'vehicle')
      .leftJoin('dc.primaryInventory', 'primaryInventory')
      .leftJoin('primaryInventory.bilty', 'bilty');

    this.applyListFilters(qb, query, { ignoreStatus: true });

    qb.select(
      `COALESCE(SUM(CASE WHEN dc.status = :pending THEN 1 ELSE 0 END), 0)`,
      'pendingCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN dc.status = :approved THEN 1 ELSE 0 END), 0)`,
        'approvedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN dc.status = :completed THEN 1 ELSE 0 END), 0)`,
        'completedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN dc.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(dc.id)`, 'totalCount')
      .addSelect(`COALESCE(SUM(dc.totalInvoices), 0)`, 'totalInvoices')
      .addSelect(`COALESCE(SUM(dc.totalCartons), 0)`, 'totalCartons')
      .addSelect(`COALESCE(SUM(dc.totalPairs), 0)`, 'totalPairs')
      .setParameter('pending', DeliveryChallanStatus.PENDING)
      .setParameter('approved', DeliveryChallanStatus.APPROVED)
      .setParameter('completed', DeliveryChallanStatus.COMPLETED)
      .setParameter('cancelled', DeliveryChallanStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();
    return {
      pendingCount: Number(raw?.pendingCount ?? 0),
      approvedCount: Number(raw?.approvedCount ?? 0),
      completedCount: Number(raw?.completedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
      totalInvoices: Number(raw?.totalInvoices ?? 0),
      totalCartons: Number(raw?.totalCartons ?? 0),
      totalPairs: Number(raw?.totalPairs ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<DeliveryChallan>,
    query: DeliveryChallanListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('dc.status = :status', { status: query.status });
    }
    if (query.shopId) {
      qb.andWhere('dc.shopId = :shopId', { shopId: query.shopId });
    }
    if (query.driverId) {
      qb.andWhere('dc.driverId = :driverId', { driverId: query.driverId });
    }
    if (query.vehicleId) {
      qb.andWhere('dc.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    }
    if (query.primaryInventoryId) {
      qb.andWhere('dc.primaryInventoryId = :primaryInventoryId', {
        primaryInventoryId: query.primaryInventoryId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('dc.challanDateTime >= :dateFrom', {
        dateFrom: `${query.dateFrom.slice(0, 10)} 00:00:00`,
      });
    }
    if (query.dateTo) {
      qb.andWhere('dc.challanDateTime <= :dateTo', {
        dateTo: `${query.dateTo.slice(0, 10)} 23:59:59`,
      });
    }
    if (query.month) {
      const year = query.year ?? new Date().getFullYear();
      qb.andWhere('EXTRACT(MONTH FROM dc.challanDateTime) = :month', {
        month: query.month,
      });
      qb.andWhere('EXTRACT(YEAR FROM dc.challanDateTime) = :year', { year });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          dc.challanNo ILIKE :search
          OR shop.shopName ILIKE :search
          OR shop.shopCode ILIKE :search
          OR shop.branchCode ILIKE :search
          OR driver.phone ILIKE :search
          OR driverUser.name ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR bilty.code ILIKE :search
          OR bilty.deliveryChallanNumber ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }
  }

  private async findByIdOrFail(id: string) {
    const row = await this.challanRepo.findOne({
      where: { id },
      relations: {
        shop: true,
        driver: { user: true },
        vehicle: true,
        primaryInventory: { bilty: true, warehouse: { client: true } },
        items: { inventory: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!row) {
      throw new NotFoundException('Delivery challan not found');
    }
    return row;
  }

  private assertEditable(challan: DeliveryChallan) {
    if (challan.status !== DeliveryChallanStatus.PENDING) {
      throw new BadRequestException(
        'Only pending delivery challans can be updated',
      );
    }
  }

  private async normalizeItems(
    items: CreateDeliveryChallanItemDto[],
    primaryInventoryId: string,
    shopId: string,
  ) {
    const inventoryIds = items.map((item) => item.inventoryId);
    const uniqueIds = [...new Set(inventoryIds)];
    if (uniqueIds.length !== inventoryIds.length) {
      throw new BadRequestException(
        'Duplicate inventory log items are not allowed',
      );
    }

    const logs = await this.logRepo.find({
      where: { id: In(uniqueIds) },
    });
    if (logs.length !== uniqueIds.length) {
      throw new NotFoundException('One or more inventory logs not found');
    }

    const byId = new Map(logs.map((log) => [log.id, log]));
    return items.map((item) => {
      const log = byId.get(item.inventoryId)!;
      if (log.primaryInventoryId !== primaryInventoryId) {
        throw new BadRequestException(
          `Inventory log ${log.InvoiceNo} does not belong to the selected primary inventory`,
        );
      }
      if (log.shopId !== shopId) {
        throw new BadRequestException(
          `Inventory log ${log.InvoiceNo} does not belong to the selected shop`,
        );
      }
      if (item.noOfCartons > log.noOfCartons) {
        throw new BadRequestException(
          `Cartons for invoice ${log.InvoiceNo} cannot exceed stock entry cartons (${log.noOfCartons})`,
        );
      }

      return {
        inventoryId: item.inventoryId,
        noOfCartons: item.noOfCartons,
        noOfPairs: item.noOfPairs ?? 0,
        remarks: this.nullableTrim(item.remarks),
      };
    });
  }

  private computeTotals(
    items: Array<{ noOfCartons: number; noOfPairs: number }>,
  ) {
    return {
      totalInvoices: items.length,
      totalCartons: items.reduce((sum, item) => sum + item.noOfCartons, 0),
      totalPairs: items.reduce((sum, item) => sum + item.noOfPairs, 0),
    };
  }

  private async generateUniqueChallanNo(
    repo: Repository<DeliveryChallan> = this.challanRepo,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const challanNo = await nextSerialCode(
        repo,
        DELIVERY_CHALLAN_PREFIX,
        'challanNo',
        DELIVERY_CHALLAN_PAD,
        attempt,
      );
      const existing = await repo.findOne({ where: { challanNo } });
      if (!existing) return challanNo;
    }
    throw new BadRequestException('Could not generate delivery challan number');
  }

  private async ensurePrimary(primaryInventoryId: string) {
    const exists = await this.primaryRepo.exist({
      where: { id: primaryInventoryId },
    });
    if (!exists) {
      throw new NotFoundException('Primary inventory not found');
    }
  }

  private async ensureShop(shopId: string) {
    const exists = await this.shopRepo.exist({ where: { id: shopId } });
    if (!exists) {
      throw new NotFoundException('Shop not found');
    }
  }

  private async ensureDriver(driverId: string) {
    const exists = await this.driverRepo.exist({ where: { id: driverId } });
    if (!exists) {
      throw new NotFoundException('Driver not found');
    }
  }

  private async ensureVehicle(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(row: DeliveryChallan) {
    const shop = row.shop;
    const driver = row.driver;
    const vehicle = row.vehicle;
    const primary = row.primaryInventory;
    const bilty = primary?.bilty;
    const warehouse = primary?.warehouse;

    return {
      id: row.id,
      challanNo: row.challanNo,
      challanDateTime: row.challanDateTime,
      primaryInventoryId: row.primaryInventoryId,
      shopId: row.shopId,
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      totalInvoices: row.totalInvoices,
      totalCartons: row.totalCartons,
      totalPairs: row.totalPairs,
      status: row.status,
      shop: shop
        ? {
            id: shop.id,
            shopName: shop.shopName,
            shopCode: shop.shopCode ?? null,
            branchCode: shop.branchCode,
          }
        : null,
      driver: driver
        ? {
            id: driver.id,
            phone: driver.phone ?? null,
            name: driver.user?.name ?? null,
          }
        : null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            regNo: vehicle.regNo,
          }
        : null,
      primaryInventory: primary
        ? {
            id: primary.id,
            warehouseId: primary.warehouseId,
            biltyId: primary.biltyId,
            biltyCode: bilty?.code ?? null,
            deliveryChallanNumber: bilty?.deliveryChallanNumber ?? null,
            warehouseName: warehouse?.client?.companyName ?? null,
          }
        : null,
      items: (row.items ?? []).map((item) => ({
        id: item.id,
        inventoryId: item.inventoryId,
        noOfCartons: item.noOfCartons,
        noOfPairs: item.noOfPairs,
        remarks: item.remarks ?? null,
        inventory: item.inventory
          ? {
              id: item.inventory.id,
              InvoiceNo: item.inventory.InvoiceNo,
              noOfCartons: item.inventory.noOfCartons,
              noOfPairs: item.inventory.noOfPairs,
            }
          : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
