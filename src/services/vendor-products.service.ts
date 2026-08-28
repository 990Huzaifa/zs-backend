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
import { VendorProduct } from '../database/entities/vendor.entity';

@Injectable()
export class VendorProductsService {
  constructor(
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
  ) {}

  async create(dto: CreateVendorProductDto): Promise<VendorProduct> {
    const saved = await this.productRepo.save(
      this.productRepo.create({
        name: dto.name.trim(),
        description: this.normalizeOptionalText(dto.description),
        price: dto.price,
      }),
    );
    return this.findByIdOrFail(saved.id);
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
  ): Promise<VendorProduct> {
    const product = await this.findByIdOrFail(id);

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) {
      product.description = this.normalizeOptionalText(dto.description);
    }
    if (dto.price !== undefined) product.price = dto.price;

    await this.productRepo.save(product);
    return this.findByIdOrFail(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findByIdOrFail(id);

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
