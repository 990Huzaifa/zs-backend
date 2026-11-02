import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockBalanceListQueryDto } from '../auth/dto/stock-entry.dto';
import { StockBalance } from '../database/entities/warehousing/inventory.entity';

@Injectable()
export class StockBalancesService {
  constructor(
    @InjectRepository(StockBalance)
    private readonly stockRepo: Repository<StockBalance>,
  ) {}

  async findAll(query: StockBalanceListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.stockRepo
      .createQueryBuilder('stock')
      .leftJoinAndSelect('stock.warehouse', 'warehouse')
      .leftJoinAndSelect('warehouse.client', 'warehouseClient')
      .leftJoinAndSelect('stock.shop', 'shop')
      .orderBy('stock.updatedAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.warehouseId) {
      qb.andWhere('stock.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }
    if (query.shopId) {
      qb.andWhere('stock.shopId = :shopId', { shopId: query.shopId });
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

  private toResponse(row: StockBalance) {
    const warehouse = row.warehouse;
    const shop = row.shop;
    return {
      id: row.id,
      warehouseId: row.warehouseId ?? null,
      shopId: row.shopId ?? null,
      avaiableCartons: row.avaiableCartons,
      damagedCartons: row.damagedCartons,
      returnedCartons: row.returnedCartons,
      warehouse: warehouse
        ? {
            id: warehouse.id,
            clientId: warehouse.clientId ?? null,
            clientName: warehouse.client?.companyName ?? null,
          }
        : null,
      shop: shop
        ? {
            id: shop.id,
            shopName: shop.shopName,
            branchCode: shop.branchCode,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
