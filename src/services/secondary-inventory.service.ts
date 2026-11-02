import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  CheckSecondaryInvoiceQueryDto,
  CreateSecondaryInventoryDto,
  SecondaryInventoryListQueryDto,
} from '../auth/dto/secondary-inventory.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Shop } from '../database/entities/shop.entity';
import {
  InventoryLog,
  LogType,
  PrimaryInventory,
  SecondaryInventory,
  StockBalance,
} from '../database/entities/warehousing/inventory.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class SecondaryInventoryService {
  constructor(
    @InjectRepository(SecondaryInventory)
    private readonly secondaryRepo: Repository<SecondaryInventory>,
    @InjectRepository(PrimaryInventory)
    private readonly primaryRepo: Repository<PrimaryInventory>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(InventoryLog)
    private readonly logRepo: Repository<InventoryLog>,
    @InjectRepository(StockBalance)
    private readonly stockRepo: Repository<StockBalance>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateSecondaryInventoryDto,
    activity?: ActivityActorContext,
  ) {
    const invoiceNo = dto.InvoiceNo.trim();
    if (!invoiceNo) {
      throw new BadRequestException('Invoice number is required');
    }

    await this.ensurePrimary(dto.primaryInventoryId);
    await this.ensureShop(dto.shopId);
    await this.ensureUniqueInvoice(invoiceNo);

    const saved = await this.dataSource.transaction(async (manager) => {
      const secondaryRepo = manager.getRepository(SecondaryInventory);
      const logRepo = manager.getRepository(InventoryLog);
      const stockRepo = manager.getRepository(StockBalance);

      const stockCode = await this.nextStockCode(manager);

      const row = await secondaryRepo.save(
        secondaryRepo.create({
          stockCode,
          primaryInventoryId: dto.primaryInventoryId,
          shopId: dto.shopId,
          InvoiceNo: invoiceNo,
          noOfCartons: dto.noOfCartons,
          noOfPairs: dto.noOfPairs ?? 0,
          damagedCartons: dto.damagedCartons ?? 0,
          returnedCartons: dto.returnedCartons ?? 0,
          remarks: this.nullableTrim(dto.remarks),
        }),
      );

      await logRepo.save(
        logRepo.create({
          secondaryInventoryId: row.id,
          logType: LogType.INVENTORY_IN,
        }),
      );

      await this.applyShopStockIn(stockRepo, {
        shopId: dto.shopId,
        cartons: dto.noOfCartons,
        damaged: dto.damagedCartons ?? 0,
        returned: dto.returnedCartons ?? 0,
      });

      return row;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'SecondaryInventory',
        entityId: saved.id,
        record: saved.stockCode,
        description: `Created secondary inventory ${saved.stockCode} (invoice ${saved.InvoiceNo})`,
        metadata: {
          primaryInventoryId: saved.primaryInventoryId,
          shopId: saved.shopId,
          InvoiceNo: saved.InvoiceNo,
          stockCode: saved.stockCode,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: SecondaryInventoryListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.secondaryRepo
      .createQueryBuilder('secondary')
      .leftJoinAndSelect('secondary.shop', 'shop')
      .leftJoinAndSelect('secondary.primaryInventory', 'primary')
      .leftJoinAndSelect('primary.bilty', 'bilty')
      .leftJoinAndSelect('primary.warehouse', 'warehouse')
      .leftJoinAndSelect('warehouse.client', 'warehouseClient')
      .orderBy('secondary.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.primaryInventoryId) {
      qb.andWhere('secondary.primaryInventoryId = :primaryInventoryId', {
        primaryInventoryId: query.primaryInventoryId,
      });
    }
    if (query.shopId) {
      qb.andWhere('secondary.shopId = :shopId', { shopId: query.shopId });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          secondary.stockCode ILIKE :search
          OR secondary."InvoiceNo" ILIKE :search
          OR shop.shopName ILIKE :search
          OR bilty.deliveryChallanNumber ILIKE :search
          OR bilty.code ILIKE :search
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
    const row = await this.secondaryRepo.findOne({
      where: { id },
      relations: {
        shop: true,
        primaryInventory: {
          bilty: true,
          warehouse: { client: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Secondary inventory not found');
    }
    return this.toResponse(row);
  }

  /**
   * Live check while typing invoice number.
   */
  async checkInvoice(query: CheckSecondaryInvoiceQueryDto) {
    const invoiceNo = query.invoiceNo.trim();
    if (!invoiceNo) {
      return { invoiceNo, available: false, exists: false };
    }
    const existing = await this.secondaryRepo.findOne({
      where: { InvoiceNo: invoiceNo },
      select: ['id'],
    });
    return {
      invoiceNo,
      available: !existing,
      exists: !!existing,
    };
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

  private async ensureUniqueInvoice(invoiceNo: string) {
    const existing = await this.secondaryRepo.findOne({
      where: { InvoiceNo: invoiceNo },
    });
    if (existing) {
      throw new ConflictException('Invoice number already exists');
    }
  }

  /**
   * Next stock code: 1, 2, 3… (no leading zeros).
   */
  private async nextStockCode(manager: EntityManager): Promise<string> {
    const result = (await manager.query(`
      SELECT COALESCE(
        MAX(CAST("stockCode" AS INTEGER)),
        0
      ) AS "maxCode"
      FROM "secondary_inventory"
      WHERE "stockCode" ~ '^[0-9]+$'
    `)) as Array<{ maxCode: string | number | null }>;

    const max = Number(result?.[0]?.maxCode ?? 0);
    const next = (Number.isFinite(max) ? max : 0) + 1;
    return String(next);
  }

  private async applyShopStockIn(
    stockRepo: Repository<StockBalance>,
    opts: {
      shopId: string;
      cartons: number;
      damaged: number;
      returned: number;
    },
  ) {
    let balance = await stockRepo.findOne({
      where: { shopId: opts.shopId, warehouseId: IsNull() },
    });
    if (!balance) {
      balance = stockRepo.create({
        shopId: opts.shopId,
        warehouseId: null,
        avaiableCartons: 0,
        damagedCartons: 0,
        returnedCartons: 0,
      });
    }
    balance.avaiableCartons =
      (balance.avaiableCartons ?? 0) + opts.cartons;
    balance.damagedCartons =
      (balance.damagedCartons ?? 0) + opts.damaged;
    balance.returnedCartons =
      (balance.returnedCartons ?? 0) + opts.returned;
    await stockRepo.save(balance);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(row: SecondaryInventory) {
    const primary = row.primaryInventory;
    const bilty = primary?.bilty;
    const warehouse = primary?.warehouse;
    const shop = row.shop;

    return {
      id: row.id,
      stockCode: row.stockCode,
      primaryInventoryId: row.primaryInventoryId,
      shopId: row.shopId,
      InvoiceNo: row.InvoiceNo,
      noOfCartons: row.noOfCartons,
      noOfPairs: row.noOfPairs,
      damagedCartons: row.damagedCartons,
      returnedCartons: row.returnedCartons,
      remarks: row.remarks ?? null,
      shop: shop
        ? {
            id: shop.id,
            shopName: shop.shopName,
            branchCode: shop.branchCode,
          }
        : null,
      primaryInventory: primary
        ? {
            id: primary.id,
            warehouseId: primary.warehouseId,
            biltyId: primary.biltyId,
            deliveryChallanNumber: bilty?.deliveryChallanNumber ?? null,
            biltyCode: bilty?.code ?? null,
            warehouseName: warehouse?.client?.companyName ?? null,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
