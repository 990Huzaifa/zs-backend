import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryLogListQueryDto } from '../auth/dto/stock-entry.dto';
import { InventoryLog } from '../database/entities/warehousing/inventory.entity';

@Injectable()
export class InventoryLogsService {
  constructor(
    @InjectRepository(InventoryLog)
    private readonly logRepo: Repository<InventoryLog>,
  ) {}

  async findAll(query: InventoryLogListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.shop', 'shop')
      .leftJoinAndSelect('log.primaryInventory', 'primary')
      .leftJoinAndSelect('primary.bilty', 'bilty')
      .leftJoinAndSelect('primary.warehouse', 'warehouse')
      .leftJoinAndSelect('warehouse.client', 'warehouseClient')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.shopId) {
      qb.andWhere('log.shopId = :shopId', { shopId: query.shopId });
    }
    if (query.primaryInventoryId) {
      qb.andWhere('log.primaryInventoryId = :primaryInventoryId', {
        primaryInventoryId: query.primaryInventoryId,
      });
    }
    if (query.logType) {
      qb.andWhere('log.logType = :logType', { logType: query.logType });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          log."InvoiceNo" ILIKE :search
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

  private toResponse(row: InventoryLog) {
    const primary = row.primaryInventory;
    const bilty = primary?.bilty;
    const warehouse = primary?.warehouse;
    const shop = row.shop;

    return {
      id: row.id,
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
            warehouseName: warehouse?.client?.companyName ?? null,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
