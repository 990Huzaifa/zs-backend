import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  CheckStockEntryInvoiceQueryDto,
  CreateStockEntryDto,
} from '../auth/dto/stock-entry.dto';
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
  StockBalance,
} from '../database/entities/warehousing/inventory.entity';
import { ActivitiesService } from './activities.service';

/**
 * Stock entry = inventory log (INVENTORY_IN) + shop stock balance upsert.
 */
@Injectable()
export class StockEntriesService {
  constructor(
    @InjectRepository(InventoryLog)
    private readonly logRepo: Repository<InventoryLog>,
    @InjectRepository(PrimaryInventory)
    private readonly primaryRepo: Repository<PrimaryInventory>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateStockEntryDto, activity?: ActivityActorContext) {
    const invoiceNo = dto.InvoiceNo.trim();
    if (!invoiceNo) {
      throw new BadRequestException('Invoice number is required');
    }

    await this.ensurePrimary(dto.primaryInventoryId);
    await this.ensureShop(dto.shopId);
    await this.ensureUniqueInvoice(invoiceNo);

    const damaged = dto.damagedCartons ?? 0;
    const returned = dto.returnedCartons ?? 0;
    if (damaged + returned > dto.noOfCartons) {
      throw new BadRequestException(
        'damagedCartons + returnedCartons cannot exceed noOfCartons',
      );
    }
    const availableCartons = dto.noOfCartons - damaged - returned;
    const proofImages = this.normalizeProofImages(dto.proofImages);

    const saved = await this.dataSource.transaction(async (manager) => {
      const logRepo = manager.getRepository(InventoryLog);
      const stockRepo = manager.getRepository(StockBalance);

      const log = await logRepo.save(
        logRepo.create({
          arrivalDate: dto.arrivalDate.slice(0, 10) as unknown as Date,
          primaryInventoryId: dto.primaryInventoryId,
          shopId: dto.shopId,
          InvoiceNo: invoiceNo,
          noOfCartons: dto.noOfCartons,
          noOfPairs: dto.noOfPairs ?? 0,
          damagedCartons: damaged,
          returnedCartons: returned,
          remarks: this.nullableTrim(dto.remarks),
          proofImages,
          logType: LogType.INVENTORY_IN,
        }),
      );

      await this.applyShopStockIn(stockRepo, {
        shopId: dto.shopId,
        available: availableCartons,
        damaged,
        returned,
      });

      return log;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'InventoryLog',
        entityId: saved.id,
        record: saved.InvoiceNo,
        description: `Created stock entry / inventory log ${saved.InvoiceNo}`,
        metadata: {
          primaryInventoryId: saved.primaryInventoryId,
          shopId: saved.shopId,
          InvoiceNo: saved.InvoiceNo,
          logType: saved.logType,
        },
      },
      activity,
    );

    return this.toResponse(await this.loadLog(saved.id));
  }

  async checkInvoice(query: CheckStockEntryInvoiceQueryDto) {
    const invoiceNo = query.invoiceNo.trim();
    if (!invoiceNo) {
      return { invoiceNo, available: false, exists: false };
    }
    const existing = await this.logRepo.findOne({
      where: { InvoiceNo: invoiceNo },
      select: ['id'],
    });
    return {
      invoiceNo,
      available: !existing,
      exists: !!existing,
    };
  }

  private async loadLog(id: string) {
    const row = await this.logRepo.findOne({
      where: { id },
      relations: {
        shop: true,
        primaryInventory: {
          bilty: { vehicle: true },
          warehouse: { client: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Inventory log not found');
    }
    return row;
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
    const existing = await this.logRepo.findOne({
      where: { InvoiceNo: invoiceNo },
    });
    if (existing) {
      throw new ConflictException('Invoice number already exists');
    }
  }

  private async applyShopStockIn(
    stockRepo: Repository<StockBalance>,
    opts: {
      shopId: string;
      available: number;
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
      (balance.avaiableCartons ?? 0) + opts.available;
    balance.damagedCartons =
      (balance.damagedCartons ?? 0) + opts.damaged;
    balance.returnedCartons =
      (balance.returnedCartons ?? 0) + opts.returned;
    await stockRepo.save(balance);
  }

  private normalizeProofImages(
    value?: string[] | null,
  ): string[] | null {
    if (value === undefined || value === null) return null;
    const cleaned = value.map((v) => v.trim()).filter(Boolean);
    return cleaned.length ? cleaned : null;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(row: InventoryLog) {
    const primary = row.primaryInventory;
    const bilty = primary?.bilty;
    const warehouse = primary?.warehouse;
    const shop = row.shop;

    return {
      id: row.id,
      arrivalDate: this.toDateString(row.arrivalDate),
      primaryInventoryId: row.primaryInventoryId,
      shopId: row.shopId,
      InvoiceNo: row.InvoiceNo,
      noOfCartons: row.noOfCartons,
      noOfPairs: row.noOfPairs,
      damagedCartons: row.damagedCartons,
      returnedCartons: row.returnedCartons,
      remarks: row.remarks ?? null,
      proofImages: row.proofImages ?? null,
      logType: row.logType,
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
            primaryVehicle:
              bilty?.vehicle?.regNo
              ?? bilty?.vehicleRegistrationNumber
              ?? null,
            warehouseName: warehouse?.client?.companyName ?? null,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDateString(value: string | Date | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
}
