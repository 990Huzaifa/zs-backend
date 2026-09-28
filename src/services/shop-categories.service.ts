import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateShopCategoryDto,
  ShopCategoryListQueryDto,
  UpdateShopCategoryDto,
} from '../auth/dto/shop-category.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { ShopCategory } from '../database/entities/shop.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class ShopCategoriesService {
  constructor(
    @InjectRepository(ShopCategory)
    private readonly categoryRepo: Repository<ShopCategory>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateShopCategoryDto, activity?: ActivityActorContext) {
    const name = dto.name.trim();
    await this.ensureUniqueName(name);

    const saved = await this.categoryRepo.save(
      this.categoryRepo.create({ name }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ShopCategory',
        entityId: saved.id,
        record: saved.name,
        description: `Created shop category ${saved.name}`,
      },
      activity,
    );

    return this.toResponse(saved, 0);
  }

  async findAll(query: ShopCategoryListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.shopCount', 'c.shops')
      .orderBy('c.name', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) =>
        this.toResponse(
          row,
          (row as ShopCategory & { shopCount?: number }).shopCount,
        ),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const category = await this.categoryRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.shopCount', 'c.shops')
      .where('c.id = :id', { id })
      .getOne();
    if (!category) {
      throw new NotFoundException('Shop category not found');
    }
    return this.toResponse(
      category,
      (category as ShopCategory & { shopCount?: number }).shopCount,
    );
  }

  async update(
    id: string,
    dto: UpdateShopCategoryDto,
    activity?: ActivityActorContext,
  ) {
    const category = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureUniqueName(name, id);
      category.name = name;
    }

    await this.categoryRepo.save(category);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ShopCategory',
        entityId: category.id,
        record: category.name,
        description: `Updated shop category ${category.name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const category = await this.findByIdOrFail(id);

    const shopCount = await this.categoryRepo
      .createQueryBuilder('c')
      .leftJoin('c.shops', 's')
      .where('c.id = :id', { id })
      .select('COUNT(s.id)', 'count')
      .getRawOne<{ count: string }>();

    if (Number(shopCount?.count ?? 0) > 0) {
      throw new ConflictException(
        'Cannot delete shop category with assigned shops',
      );
    }

    await this.categoryRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ShopCategory',
        entityId: category.id,
        record: category.name,
        description: `Deleted shop category ${category.name}`,
      },
      activity,
    );

    return { message: 'Shop category deleted' };
  }

  async listUtility(opts: { search?: string } = {}) {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name'])
      .orderBy('c.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((c) => ({
        id: c.id,
        label: c.name,
        name: c.name,
      })),
    };
  }

  async assertExists(id: string) {
    const exists = await this.categoryRepo.exist({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Shop category not found');
    }
  }

  private async findByIdOrFail(id: string) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Shop category not found');
    }
    return category;
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const existing = await this.categoryRepo
      .createQueryBuilder('c')
      .where('LOWER(c.name) = LOWER(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Shop category name already exists');
    }
  }

  private toResponse(category: ShopCategory, shopCount?: number) {
    return {
      id: category.id,
      name: category.name,
      shopCount: shopCount ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
