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
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityActorType,
  ActivityModule,
} from '../database/entities/activity.entity';
import { City } from '../database/entities/city.entity';
import {
  RateStatus,
  Vendor,
  VendorProduct,
  VendorRate,
  VendorRateLog,
} from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

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
    private readonly activitiesService: ActivitiesService,
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
    const activatedIds: string[] = [];

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
        activatedIds.push(winner.id);

        await this.activitiesService.logAction(
          {
            action: ActivityAction.UPDATE,
            module: ActivityModule.BILLING,
            entityType: 'VendorRate',
            entityId: winner.id,
            record: this.rateRecordLabel(winner),
            description: `Activated vendor rate ${winner.id}`,
            metadata: {
              status: RateStatus.ACTIVE,
              vendorId: winner.vendorId,
              productId: winner.productId,
              cityId: winner.cityId,
              price: winner.price,
              effectiveFromDate: winner.effectiveFromDate,
              source: 'cron',
            },
            actorType: ActivityActorType.SYSTEM,
          },
          undefined,
        );
      }
    }

    if (activated > 0 || expired > 0) {
      await this.activitiesService.logAction(
        {
          action: ActivityAction.UPDATE,
          module: ActivityModule.BILLING,
          entityType: 'VendorRate',
          record: 'Scheduled rate activation',
          description: `Vendor rate cron activated ${activated} and expired ${expired}`,
          metadata: {
            activated,
            expired,
            activatedIds,
          },
          actorType: ActivityActorType.SYSTEM,
        },
        undefined,
      );
    }

    return { activated, expired };
  }

  async create(dto: CreateVendorRateDto, activity?: ActivityActorContext) {
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

    const rate = await this.findOne(saved.id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: rate.id,
        record: this.rateRecordLabel(rate),
        description: `Created vendor rate ${this.rateRecordLabel(rate)}`,
        metadata: {
          vendorId: rate.vendorId,
          productId: rate.productId,
          cityId: rate.cityId,
          price: rate.price,
          status: rate.status,
          effectiveFromDate: rate.effectiveFromDate,
        },
      },
      activity,
    );

    return rate;
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
          OR vendor.ownerName ILIKE :search
          OR vendor.vendorName ILIKE :search
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

  /**
   * Products that have at least one rate for this vendor (trip fuel/pump chain).
   */
  async listProductsUtility(vendorId: string, search?: string) {
    await this.ensureVendor(vendorId);

    const qb = this.productRepo
      .createQueryBuilder('product')
      .innerJoin('product.rates', 'rate')
      .where('rate.vendorId = :vendorId', { vendorId })
      .select([
        'product.id',
        'product.name',
        'product.description',
        'product.price',
      ])
      .distinct(true)
      .orderBy('product.name', 'ASC');

    const term = search?.trim();
    if (term) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search)',
        { search: `%${term}%` },
      );
    }

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Rates for vendor + product (default ACTIVE) for trip expense rate auto-fill.
   */
  async listRatesUtility(opts: {
    vendorId: string;
    productId: string;
    cityId?: number;
    status?: RateStatus;
  }) {
    await this.ensureVendor(opts.vendorId);
    await this.ensureProduct(opts.productId);

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.city', 'city')
      .leftJoinAndSelect('rate.product', 'product')
      .where('rate.vendorId = :vendorId', { vendorId: opts.vendorId })
      .andWhere('rate.productId = :productId', { productId: opts.productId })
      .orderBy('rate.effectiveFromDate', 'DESC');

    qb.andWhere('rate.status = :status', {
      status: opts.status ?? RateStatus.ACTIVE,
    });

    if (opts.cityId !== undefined) {
      qb.andWhere('rate.cityId = :cityId', { cityId: opts.cityId });
    }

    const rows = await qb.getMany();

    return {
      data: rows.map((rate) => ({
        id: rate.id,
        vendorId: rate.vendorId,
        productId: rate.productId,
        cityId: rate.cityId,
        locationName: rate.locationName ?? null,
        price: rate.price,
        effectiveFromDate: rate.effectiveFromDate,
        status: rate.status,
        city: rate.city
          ? { id: rate.city.id, name: rate.city.name, code: rate.city.code }
          : null,
        product: rate.product
          ? { id: rate.product.id, name: rate.product.name }
          : null,
      })),
      /** Convenience: first ACTIVE rate price for form prefill (null if none). */
      suggestedRate: rows[0]?.price ?? null,
    };
  }

  /**
   * Highest ACTIVE vendor rate for a product across all vendors (any city).
   */
  async getHighestRateForProductUtility(productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }

    const rate = await this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.vendor', 'vendor')
      .leftJoinAndSelect('rate.city', 'city')
      .where('rate.productId = :productId', { productId })
      .andWhere('rate.status = :status', { status: RateStatus.ACTIVE })
      .orderBy('rate.price', 'DESC')
      .addOrderBy('rate.effectiveFromDate', 'DESC')
      .addOrderBy('rate.createdAt', 'DESC')
      .getOne();

    return {
      productId: product.id,
      product: {
        id: product.id,
        name: product.name,
      },
      highestPrice: rate?.price ?? null,
      rate: rate
        ? {
            id: rate.id,
            vendorId: rate.vendorId,
            vendor: rate.vendor
              ? {
                  id: rate.vendor.id,
                  vendorName: rate.vendor.vendorName,
                  ownerName: rate.vendor.ownerName,
                }
              : null,
            productId: rate.productId,
            cityId: rate.cityId,
            locationName: rate.locationName ?? null,
            price: rate.price,
            effectiveFromDate: rate.effectiveFromDate,
            status: rate.status,
            city: rate.city
              ? { id: rate.city.id, name: rate.city.name, code: rate.city.code }
              : null,
          }
        : null,
    };
  }

  async findLogs(id: string) {
    await this.findByIdOrFail(id);
    const logs = await this.getRecentLogs(id);
    return { data: logs };
  }

  async update(
    id: string,
    dto: UpdateVendorRateDto,
    activity?: ActivityActorContext,
  ) {
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

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: updated.id,
        record: this.rateRecordLabel(updated),
        description: `Updated vendor rate ${this.rateRecordLabel(updated)}`,
        metadata: {
          vendorId: updated.vendorId,
          productId: updated.productId,
          cityId: updated.cityId,
          price: updated.price,
          previousPrice: priceChanged ? previousPrice : undefined,
          status: updated.status,
          effectiveFromDate: updated.effectiveFromDate,
        },
      },
      activity,
    );

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeVendorRateStatusDto,
    activity?: ActivityActorContext,
  ) {
    const rate = await this.findByIdOrFail(id);

    if (rate.status === dto.status) {
      return this.findOne(id);
    }

    const previousStatus = rate.status;
    rate.status = dto.status;
    await this.rateRepo.save(rate);

    if (dto.status === RateStatus.ACTIVE) {
      await this.expireOtherActiveRates(rate);
    }

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: updated.id,
        record: this.rateRecordLabel(updated),
        description: `Changed vendor rate ${this.rateRecordLabel(updated)} status to ${updated.status}`,
        metadata: {
          previousStatus,
          status: updated.status,
          vendorId: updated.vendorId,
          productId: updated.productId,
          cityId: updated.cityId,
        },
      },
      activity,
    );

    return updated;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const rate = await this.findByIdOrFail(id);
    await this.rateRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: rate.id,
        record: this.rateRecordLabel(rate),
        description: `Deleted vendor rate ${this.rateRecordLabel(rate)}`,
        metadata: {
          vendorId: rate.vendorId,
          productId: rate.productId,
          cityId: rate.cityId,
          price: rate.price,
          status: rate.status,
        },
      },
      activity,
    );

    return { message: 'Vendor rate deleted' };
  }

  private rateRecordLabel(
    rate: Pick<VendorRate, 'locationName' | 'price' | 'id'> & {
      vendor?: Pick<Vendor, 'ownerName' | 'vendorName'> | null;
      product?: Pick<VendorProduct, 'name'> | null;
      city?: Pick<City, 'name'> | null;
    },
  ): string {
    const vendorLabel =
      rate.vendor?.vendorName?.trim() ||
      rate.vendor?.ownerName?.trim() ||
      null;
    const parts = [
      vendorLabel,
      rate.product?.name,
      rate.city?.name ?? rate.locationName,
      rate.price != null ? `$${rate.price}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : rate.id;
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
