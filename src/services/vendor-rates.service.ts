import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChangeVendorRateStatusDto,
  CreateVendorRateDto,
  UpdateVendorRateDto,
  VendorRateListQueryDto,
} from '../auth/dto/vendor-rate.dto';
import { City } from '../database/entities/city.entity';
import {
  RateStatus,
  Vendor,
  VendorProduct,
  VendorRate,
} from '../database/entities/vendor.entity';

@Injectable()
export class VendorRatesService {
  constructor(
    @InjectRepository(VendorRate)
    private readonly rateRepo: Repository<VendorRate>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  async create(dto: CreateVendorRateDto): Promise<VendorRate> {
    await this.ensureVendor(dto.vendorId);
    await this.ensureProduct(dto.productId);
    await this.ensureCity(dto.cityId);

    const saved = await this.rateRepo.save(
      this.rateRepo.create({
        vendorId: dto.vendorId,
        productId: dto.productId,
        locationName: this.normalizeOptionalText(dto.locationName),
        cityId: dto.cityId,
        price: this.formatPrice(dto.price),
        effectiveFromDate: dto.effectiveFromDate.slice(0, 10),
        status: dto.status ?? RateStatus.SCHEDULED,
      }),
    );

    return this.findByIdOrFail(saved.id);
  }

  async findAll(query: VendorRateListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.vendor', 'vendor')
      .leftJoinAndSelect('rate.product', 'product')
      .leftJoinAndSelect('rate.city', 'city')
      .orderBy('rate.createdAt', 'DESC');

    if (query.vendorId) {
      qb.andWhere('rate.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.productId) {
      qb.andWhere('rate.productId = :productId', {
        productId: query.productId,
      });
    }
    if (query.cityId !== undefined) {
      qb.andWhere('rate.cityId = :cityId', { cityId: query.cityId });
    }
    if (query.status) {
      qb.andWhere('rate.status = :status', { status: query.status });
    }
    if (query.effectiveFrom) {
      qb.andWhere('rate.effectiveFromDate >= :effectiveFrom', {
        effectiveFrom: query.effectiveFrom.slice(0, 10),
      });
    }
    if (query.effectiveTo) {
      qb.andWhere('rate.effectiveFromDate <= :effectiveTo', {
        effectiveTo: query.effectiveTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          rate.locationName ILIKE :search
          OR vendor.name ILIKE :search
          OR product.name ILIKE :search
          OR city.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
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

  async findOne(id: string): Promise<VendorRate> {
    return this.findByIdOrFail(id);
  }

  async update(id: string, dto: UpdateVendorRateDto): Promise<VendorRate> {
    const rate = await this.findByIdOrFail(id);

    if (dto.vendorId !== undefined) {
      await this.ensureVendor(dto.vendorId);
      rate.vendorId = dto.vendorId;
    }
    if (dto.productId !== undefined) {
      await this.ensureProduct(dto.productId);
      rate.productId = dto.productId;
    }
    if (dto.cityId !== undefined) {
      await this.ensureCity(dto.cityId);
      rate.cityId = dto.cityId;
    }
    if (dto.locationName !== undefined) {
      rate.locationName = this.normalizeOptionalText(dto.locationName);
    }
    if (dto.price !== undefined) {
      rate.price = this.formatPrice(dto.price);
    }
    if (dto.effectiveFromDate !== undefined) {
      rate.effectiveFromDate = dto.effectiveFromDate.slice(0, 10);
    }

    await this.rateRepo.save(rate);
    return this.findByIdOrFail(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVendorRateStatusDto,
  ): Promise<VendorRate> {
    const rate = await this.findByIdOrFail(id);
    rate.status = dto.status;
    await this.rateRepo.save(rate);
    return this.findByIdOrFail(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findByIdOrFail(id);
    await this.rateRepo.delete(id);
    return { message: 'Vendor rate deleted' };
  }

  private async findByIdOrFail(id: string): Promise<VendorRate> {
    const rate = await this.rateRepo.findOne({
      where: { id },
      relations: {
        vendor: true,
        product: true,
        city: true,
      },
    });
    if (!rate) {
      throw new NotFoundException('Vendor rate not found');
    }
    return rate;
  }

  private async ensureVendor(vendorId: string): Promise<void> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
  }

  private async ensureProduct(productId: string): Promise<void> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }
  }

  private async ensureCity(cityId: number): Promise<void> {
    const city = await this.cityRepo.findOne({
      where: { id: cityId as unknown as string },
    });
    if (!city) {
      throw new NotFoundException('City not found');
    }
  }

  private formatPrice(price: number): string {
    return price.toFixed(2);
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
