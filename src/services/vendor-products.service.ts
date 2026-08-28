import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateVendorProductDto,
  UpdateVendorProductDto,
  VendorProductListQueryDto,
} from '../auth/dto/vendor-product.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class VendorProductsService {
  constructor(
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateVendorProductDto,
    activity?: ActivityActorContext,
  ): Promise<VendorProduct> {
    const saved = await this.productRepo.save(
      this.productRepo.create({
        name: dto.name.trim(),
        description: this.normalizeOptionalText(dto.description),
        price: dto.price,
      }),
    );
    const product = await this.findByIdOrFail(saved.id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorProduct',
        entityId: product.id,
        record: product.name,
        description: `Created vendor product ${product.name}`,
        metadata: { price: product.price },
      },
      activity,
    );

    return product;
  }

  async findAll(query: VendorProductListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.productRepo
      .createQueryBuilder('product')
      .orderBy('product.createdAt', 'DESC');

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          product.name ILIKE :search
          OR product.description ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<VendorProduct> {
    return this.findByIdOrFail(id);
  }

  async update(
    id: string,
    dto: UpdateVendorProductDto,
    activity?: ActivityActorContext,
  ): Promise<VendorProduct> {
    const product = await this.findByIdOrFail(id);

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) {
      product.description = this.normalizeOptionalText(dto.description);
    }
    if (dto.price !== undefined) product.price = dto.price;

    await this.productRepo.save(product);
    const updated = await this.findByIdOrFail(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorProduct',
        entityId: updated.id,
        record: updated.name,
        description: `Updated vendor product ${updated.name}`,
        metadata: { price: updated.price },
      },
      activity,
    );

    return updated;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const product = await this.findByIdOrFail(id);

    const linkedRates = await this.productRepo
      .createQueryBuilder('product')
      .innerJoin('product.rates', 'rate')
      .where('product.id = :id', { id })
      .getCount();

    if (linkedRates > 0) {
      throw new BadRequestException(
        'Cannot delete product that has vendor rates assigned',
      );
    }

    await this.productRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorProduct',
        entityId: product.id,
        record: product.name,
        description: `Deleted vendor product ${product.name}`,
        metadata: { price: product.price },
      },
      activity,
    );

    return { message: 'Vendor product deleted' };
  }

  private async findByIdOrFail(id: string): Promise<VendorProduct> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }
    return product;
  }

  private normalizeOptionalText(
    value?: string | null,
  ): string | null {
    if (value === undefined || value === null || value.trim() === '') {
      return null;
    }
    return value.trim();
  }
}
