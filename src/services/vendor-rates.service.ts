import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
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
  VendorRateLog,
} from '../database/entities/vendor.entity';

/** Rolling price history retained per vendor rate. */
const VENDOR_RATE_LOG_LIMIT = 10;

@Injectable()
export class VendorRatesService {
  private readonly logger = new Logger(VendorRatesService.name);

  constructor(
    @InjectRepository(VendorRate)
    private readonly rateRepo: Repository<VendorRate>,
    @InjectRepository(VendorRateLog)
    private readonly logRepo: Repository<VendorRateLog>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorProduct)
    private readonly productRepo: Repository<VendorProduct>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  /**
   * Daily: activate SCHEDULED rates whose effectiveFromDate has arrived,
   * and expire any previously ACTIVE rate for the same vendor+product+city.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledRateActivation() {
    this.logger.log('Running vendor rate activation cron...');
    const result = await this.activateDueRates();
    this.logger.log(
      `Vendor rate cron done — activated: ${result.activated}, expired: ${result.expired}`,
    );
  }

  /**
   * Activate all due SCHEDULED rates (effectiveFromDate <= today).
   * Per vendor+product+city, the latest due rate becomes ACTIVE;
   * prior ACTIVE / other due SCHEDULED in that group become EXPIRED.
   * CANCELLED rates are never touched.
   */
  async activateDueRates(today = this.todayUtc()): Promise<{
    activated: number;
    expired: number;
  }> {
    const dueScheduled = await this.rateRepo.find({
      where: {
        status: RateStatus.SCHEDULED,
        effectiveFromDate: LessThanOrEqual(today),
      },
      order: {
        effectiveFromDate: 'DESC',
        createdAt: 'DESC',
      },
    });

    if (dueScheduled.length === 0) {
      return { activated: 0, expired: 0 };
    }

    const groups = new Map<string, VendorRate[]>();
    for (const rate of dueScheduled) {
      const key = this.rateGroupKey(rate.vendorId, rate.productId, rate.cityId);
      const list = groups.get(key) ?? [];
      list.push(rate);
      groups.set(key, list);
    }

    let activated = 0;
    let expired = 0;

    for (const rates of groups.values()) {
      const winner = rates[0];
      const supersededDue = rates.slice(1);

      const previousActive = await this.rateRepo.find({
        where: {
          vendorId: winner.vendorId,
          productId: winner.productId,
          cityId: winner.cityId,
          status: RateStatus.ACTIVE,
        },
      });

      const toExpire = [
        ...previousActive.filter((r) => r.id !== winner.id),
        ...supersededDue,
      ];

      const supersededPrice =
        previousActive.find((r) => r.id !== winner.id)?.price ?? null;

      if (toExpire.length > 0) {
        for (const rate of toExpire) {
          await this.rateRepo.update(rate.id, {
            status: RateStatus.EXPIRED,
          });
          expired += 1;
        }
      }

      if (winner.status !== RateStatus.ACTIVE) {
        await this.rateRepo.update(winner.id, {
          status: RateStatus.ACTIVE,
        });
        winner.status = RateStatus.ACTIVE;
        // Price history: new active rate logs the price it replaced
        if (supersededPrice !== null && supersededPrice !== winner.price) {
          await this.writeLog(winner.id, supersededPrice);
        }
        activated += 1;
      }
    }

    return { activated, expired };
  }

  async create(dto: CreateVendorRateDto) {
    await this.ensureVendor(dto.vendorId);
    await this.ensureProduct(dto.productId);
    await this.ensureCity(dto.cityId);

    const effectiveFromDate = dto.effectiveFromDate.slice(0, 10);
    const today = this.todayUtc();
    let status = dto.status ?? RateStatus.SCHEDULED;

    if (status === RateStatus.SCHEDULED && effectiveFromDate <= today) {
      status = RateStatus.ACTIVE;
    }

    const saved = await this.rateRepo.save(
      this.rateRepo.create({
        vendorId: dto.vendorId,
        productId: dto.productId,
        locationName: this.normalizeOptionalText(dto.locationName),
        cityId: dto.cityId,
        price: this.formatPrice(dto.price),
        effectiveFromDate,
        status,
      }),
    );

    if (saved.status === RateStatus.ACTIVE) {
      await this.expireOtherActiveRates(saved);
    }

    return this.findOne(saved.id);
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

  async findOne(id: string) {
    const rate = await this.findByIdOrFail(id);
    const logs = await this.getRecentLogs(id);
    return { ...rate, logs };
  }

  async findLogs(id: string) {
    await this.findByIdOrFail(id);
    const logs = await this.getRecentLogs(id);
    return { data: logs };
  }

  async update(id: string, dto: UpdateVendorRateDto) {
    const rate = await this.findByIdOrFail(id);
    const previousPrice = rate.price;
    let priceChanged = false;

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
      const nextPrice = this.formatPrice(dto.price);
      if (rate.price !== nextPrice) {
        priceChanged = true;
      }
      rate.price = nextPrice;
    }
    if (dto.effectiveFromDate !== undefined) {
      rate.effectiveFromDate = dto.effectiveFromDate.slice(0, 10);
    }

    await this.rateRepo.save(rate);

    if (priceChanged) {
      await this.writeLog(rate.id, previousPrice);
    }

    if (
      rate.status === RateStatus.SCHEDULED &&
      rate.effectiveFromDate <= this.todayUtc()
    ) {
      await this.activateDueRates();
    }

    return this.findOne(id);
  }

  async changeStatus(id: string, dto: ChangeVendorRateStatusDto) {
    const rate = await this.findByIdOrFail(id);

    if (rate.status === dto.status) {
      return this.findOne(id);
    }

    rate.status = dto.status;
    await this.rateRepo.save(rate);

    if (dto.status === RateStatus.ACTIVE) {
      await this.expireOtherActiveRates(rate);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findByIdOrFail(id);
    await this.rateRepo.delete(id);
    return { message: 'Vendor rate deleted' };
  }

  private async expireOtherActiveRates(rate: VendorRate): Promise<void> {
    const others = await this.rateRepo.find({
      where: {
        vendorId: rate.vendorId,
        productId: rate.productId,
        cityId: rate.cityId,
        status: RateStatus.ACTIVE,
      },
    });

    let supersededPrice: string | null = null;

    for (const other of others) {
      if (other.id === rate.id) continue;
      if (supersededPrice === null) {
        supersededPrice = other.price;
      }
      other.status = RateStatus.EXPIRED;
      await this.rateRepo.save(other);
    }

    if (supersededPrice !== null && supersededPrice !== rate.price) {
      await this.writeLog(rate.id, supersededPrice);
    }
  }

  private async writeLog(
    vendorRateId: string,
    previousPrice: string | null,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        vendorRateId,
        previousPrice,
      }),
    );

    await this.pruneOldLogs(vendorRateId);
  }

  private async pruneOldLogs(vendorRateId: string): Promise<void> {
    const keep = await this.logRepo.find({
      where: { vendorRateId },
      order: { createdAt: 'DESC' },
      take: VENDOR_RATE_LOG_LIMIT,
      select: { id: true },
    });

    if (keep.length < VENDOR_RATE_LOG_LIMIT) {
      return;
    }

    const keepIds = keep.map((row) => row.id);
    await this.logRepo
      .createQueryBuilder()
      .delete()
      .from(VendorRateLog)
      .where('vendorRateId = :vendorRateId', { vendorRateId })
      .andWhere('id NOT IN (:...keepIds)', { keepIds })
      .execute();
  }

  private async getRecentLogs(vendorRateId: string): Promise<VendorRateLog[]> {
    return this.logRepo.find({
      where: { vendorRateId },
      order: { createdAt: 'DESC' },
      take: VENDOR_RATE_LOG_LIMIT,
    });
  }

  private rateGroupKey(
    vendorId: string,
    productId: string,
    cityId: number,
  ): string {
    return `${vendorId}:${productId}:${cityId}`;
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
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
