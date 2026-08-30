import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateVendorCategoryDto,
  UpdateVendorCategoryDto,
} from '../auth/dto/vendor-category.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { VendorCategory } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

/** Spaces → hyphens, lowercase (e.g. "Spare Parts" → "spare-parts"). */
export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class VendorCategoriesService {
  constructor(
    @InjectRepository(VendorCategory)
    private readonly categoryRepo: Repository<VendorCategory>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateVendorCategoryDto,
    activity?: ActivityActorContext,
  ): Promise<VendorCategory & { vendorCount: number }> {
    const name = dto.name.trim();
    const slug = (dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    const saved = await this.categoryRepo.save(
      this.categoryRepo.create({ name, slug }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorCategory',
        entityId: saved.id,
        record: saved.name,
        description: `Created vendor category ${saved.name}`,
        metadata: { slug: saved.slug },
      },
      activity,
    );

    return { ...saved, vendorCount: 0 };
  }

  async findAll(): Promise<Array<VendorCategory & { vendorCount: number }>> {
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.vendorCount', 'c.vendors')
      .orderBy('c.name', 'ASC')
      .getMany();

    return rows as Array<VendorCategory & { vendorCount: number }>;
  }

  /** Lightweight dropdown options (trip expense / vendor forms). */
  async listUtility(search?: string) {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.slug'])
      .orderBy('c.name', 'ASC');

    const term = search?.trim();
    if (term) {
      qb.andWhere('(c.name ILIKE :search OR c.slug ILIKE :search)', {
        search: `%${term}%`,
      });
    }

    const data = await qb.getMany();
    return { data };
  }

  async findOne(id: string): Promise<VendorCategory & { vendorCount: number }> {
    const row = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .loadRelationCountAndMap('c.vendorCount', 'c.vendors')
      .getOne();
    if (!row) {
      throw new NotFoundException('Vendor category not found');
    }
    return row as VendorCategory & { vendorCount: number };
  }

  async update(
    id: string,
    dto: UpdateVendorCategoryDto,
    activity?: ActivityActorContext,
  ): Promise<VendorCategory & { vendorCount: number }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Vendor category not found');
    }

    if (dto.name !== undefined) {
      category.name = dto.name.trim();
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (!slug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      if (slug !== category.slug) {
        await this.ensureUniqueSlug(slug, id);
      }
      category.slug = slug;
    } else if (dto.name !== undefined) {
      // Keep existing slug on update unless slug was sent explicitly.
    }

    await this.categoryRepo.save(category);
    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorCategory',
        entityId: updated.id,
        record: updated.name,
        description: `Updated vendor category ${updated.name}`,
        metadata: { slug: updated.slug },
      },
      activity,
    );

    return updated;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const category = await this.findOne(id);
    if (category.vendorCount > 0) {
      throw new BadRequestException(
        'Cannot delete category that has vendors assigned',
      );
    }
    await this.categoryRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorCategory',
        entityId: category.id,
        record: category.name,
        description: `Deleted vendor category ${category.name}`,
        metadata: { slug: category.slug },
      },
      activity,
    );

    return { message: 'Vendor category deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const existing = await this.categoryRepo.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vendor category slug already exists');
    }
  }
}
