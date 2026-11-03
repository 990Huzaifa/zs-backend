import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CreateShopDto,
  ShopListQueryDto,
  UpdateShopDto,
} from '../auth/dto/shop.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Shop } from '../database/entities/shop.entity';
import { ActivitiesService } from './activities.service';
import { ShopCategoriesService } from './shop-categories.service';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly shopCategoriesService: ShopCategoriesService,
  ) {}

  async create(dto: CreateShopDto, activity?: ActivityActorContext) {
    const branchCode = dto.branchCode.trim();
    await this.ensureUniqueBranchCode(branchCode);

    const shopCategoryId = await this.resolveCategoryId(dto.shopCategoryId);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Shop);
      const shopCode = await this.nextShopCode(manager);

      return repo.save(
        repo.create({
          shopCode,
          shopCategoryId,
          shopName: dto.shopName.trim(),
          inchargeName: dto.inchargeName.trim(),
          ptcl: dto.ptcl.trim(),
          branchCode,
          address: this.nullableTrim(dto.address),
          state: this.nullableTrim(dto.state),
          city: this.nullableTrim(dto.city),
          lat: this.nullableTrim(dto.lat),
          lng: this.nullableTrim(dto.lng),
        }),
      );
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: saved.id,
        record: saved.shopCode ?? saved.branchCode,
        description: `Created shop ${saved.shopName} (${saved.shopCode})`,
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: ShopListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.shopRepo
      .createQueryBuilder('shop')
      .leftJoinAndSelect('shop.shopCategory', 'shopCategory')
      .orderBy('shop.shopName', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          shop.shopName ILIKE :search
          OR shop.inchargeName ILIKE :search
          OR shop.ptcl ILIKE :search
          OR shop.shopCode ILIKE :search
          OR shop.branchCode ILIKE :search
          OR shop.address ILIKE :search
          OR shop.city ILIKE :search
          OR shop.state ILIKE :search
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
    return this.toResponse(await this.findByIdOrFail(id));
  }

  async update(
    id: string,
    dto: UpdateShopDto,
    activity?: ActivityActorContext,
  ) {
    const shop = await this.findByIdOrFail(id);

    if (dto.shopCategoryId !== undefined) {
      shop.shopCategoryId = await this.resolveCategoryId(dto.shopCategoryId);
    }
    if (dto.shopName !== undefined) {
      shop.shopName = dto.shopName.trim();
    }
    if (dto.inchargeName !== undefined) {
      shop.inchargeName = dto.inchargeName.trim();
    }
    if (dto.ptcl !== undefined) {
      shop.ptcl = dto.ptcl.trim();
    }
    if (dto.branchCode !== undefined) {
      const branchCode = dto.branchCode.trim();
      await this.ensureUniqueBranchCode(branchCode, id);
      shop.branchCode = branchCode;
    }
    if (dto.address !== undefined) {
      shop.address = this.nullableTrim(dto.address);
    }
    if (dto.state !== undefined) {
      shop.state = this.nullableTrim(dto.state);
    }
    if (dto.city !== undefined) {
      shop.city = this.nullableTrim(dto.city);
    }
    if (dto.lat !== undefined) {
      shop.lat = this.nullableTrim(dto.lat);
    }
    if (dto.lng !== undefined) {
      shop.lng = this.nullableTrim(dto.lng);
    }

    await this.shopRepo.save(shop);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: shop.id,
        record: shop.shopCode ?? shop.branchCode,
        description: `Updated shop ${shop.shopName} (${shop.shopCode ?? shop.branchCode})`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const shop = await this.findByIdOrFail(id);
    await this.shopRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: shop.id,
        record: shop.shopCode ?? shop.branchCode,
        description: `Deleted shop ${shop.shopName} (${shop.shopCode ?? shop.branchCode})`,
      },
      activity,
    );

    return { message: 'Shop deleted' };
  }

  /** Dropdown picker — id, label (= shopName), shopCode, branchCode. */
  async listUtility(
    opts: { search?: string; shopCategoryId?: string } = {},
  ) {
    const qb = this.shopRepo
      .createQueryBuilder('shop')
      .select([
        'shop.id',
        'shop.shopName',
        'shop.shopCode',
        'shop.branchCode',
        'shop.city',
        'shop.shopCategoryId',
      ])
      .orderBy('shop.shopName', 'ASC');

    if (opts.shopCategoryId) {
      qb.andWhere('shop.shopCategoryId = :shopCategoryId', {
        shopCategoryId: opts.shopCategoryId,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          shop.shopName ILIKE :search
          OR shop.shopCode ILIKE :search
          OR shop.branchCode ILIKE :search
          OR shop.city ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((s) => ({
        id: s.id,
        label: s.shopName,
        shopName: s.shopName,
        shopCode: s.shopCode ?? null,
        branchCode: s.branchCode,
        city: s.city,
        shopCategoryId: s.shopCategoryId ?? null,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const shop = await this.shopRepo.findOne({
      where: { id },
      relations: { shopCategory: true },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return shop;
  }

  private async resolveCategoryId(
    shopCategoryId?: string | null,
  ): Promise<string | null> {
    if (shopCategoryId === undefined || shopCategoryId === null) {
      return null;
    }
    await this.shopCategoriesService.assertExists(shopCategoryId);
    return shopCategoryId;
  }

  private async ensureUniqueBranchCode(branchCode: string, excludeId?: string) {
    const existing = await this.shopRepo
      .createQueryBuilder('shop')
      .where('LOWER(shop.branchCode) = LOWER(:branchCode)', { branchCode })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Branch code already exists');
    }
  }

  /**
   * Next shop code: SH-0001, SH-0002, … (4-digit pad).
   */
  private async nextShopCode(manager: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  }): Promise<string> {
    const result = (await manager.query(`
      SELECT COALESCE(
        MAX(
          CAST(SUBSTRING("shopCode" FROM 4) AS INTEGER)
        ),
        0
      ) AS "maxCode"
      FROM "shop"
      WHERE "shopCode" ~ '^SH-[0-9]+$'
    `)) as Array<{ maxCode: string | number | null }>;

    const max = Number(result?.[0]?.maxCode ?? 0);
    const next = (Number.isFinite(max) ? max : 0) + 1;
    return `SH-${String(next).padStart(4, '0')}`;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(shop: Shop) {
    return {
      id: shop.id,
      shopCode: shop.shopCode ?? null,
      shopCategoryId: shop.shopCategoryId,
      shopCategory: shop.shopCategory
        ? {
            id: shop.shopCategory.id,
            name: shop.shopCategory.name,
          }
        : null,
      shopName: shop.shopName,
      inchargeName: shop.inchargeName,
      ptcl: shop.ptcl,
      branchCode: shop.branchCode,
      address: shop.address,
      state: shop.state,
      city: shop.city,
      lat: shop.lat,
      lng: shop.lng,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }
}
