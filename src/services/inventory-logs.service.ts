import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryLogListQueryDto } from '../auth/dto/secondary-inventory.dto';
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
      .leftJoinAndSelect('log.secondaryInventory', 'secondary')
      .leftJoinAndSelect('secondary.shop', 'shop')
      .leftJoinAndSelect('secondary.primaryInventory', 'primary')
      .leftJoinAndSelect('primary.bilty', 'bilty')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.secondaryInventoryId) {
      qb.andWhere('log.secondaryInventoryId = :secondaryInventoryId', {
        secondaryInventoryId: query.secondaryInventoryId,
      });
    }
    if (query.shopId) {
      qb.andWhere('secondary.shopId = :shopId', { shopId: query.shopId });
    }
    if (query.primaryInventoryId) {
      qb.andWhere('secondary.primaryInventoryId = :primaryInventoryId', {
        primaryInventoryId: query.primaryInventoryId,
      });
    }
    if (query.logType) {
      qb.andWhere('log.logType = :logType', { logType: query.logType });
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
    const secondary = row.secondaryInventory;
    return {
      id: row.id,
      secondaryInventoryId: row.secondaryInventoryId ?? null,
      logType: row.logType,
      secondaryInventory: secondary
        ? {
            id: secondary.id,
            stockCode: secondary.stockCode,
            InvoiceNo: secondary.InvoiceNo,
            shopId: secondary.shopId,
            primaryInventoryId: secondary.primaryInventoryId,
            shop: secondary.shop
              ? {
                  id: secondary.shop.id,
                  shopName: secondary.shop.shopName,
                  branchCode: secondary.shop.branchCode,
                }
              : null,
            deliveryChallanNumber:
              secondary.primaryInventory?.bilty?.deliveryChallanNumber ?? null,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
