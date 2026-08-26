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
import { VendorCategory } from '../database/entities/vendor.entity';

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
  ) {}

  async create(dto: CreateVendorCategoryDto): Promise<VendorCategory & { vendorCount: number }> {
    const name = dto.name.trim();
    const slug = (dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    const saved = await this.categoryRepo.save(
      this.categoryRepo.create({ name, slug }),
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
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const category = await this.findOne(id);
    if (category.vendorCount > 0) {
      throw new BadRequestException(
        'Cannot delete category that has vendors assigned',
      );
    }
    await this.categoryRepo.delete(id);
    return { message: 'Vendor category deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const existing = await this.categoryRepo.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vendor category slug already exists');
    }
  }
}
