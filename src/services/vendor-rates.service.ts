import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import {
  BulkCreateVendorRateDto,
  BulkUpdateVendorRateDto,
  BulkUpdateVendorRateItemDto,
  ChangeVendorRateStatusDto,
  CreateVendorRateDto,
  CreateVendorRateLogDto,
  UpdateVendorRateDto,
  UpdateVendorRateLogDto,
  VendorRateListQueryDto,
} from '../auth/dto/vendor-rate.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityActorType,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  RateStatus,
  Vendor,
  VendorProduct,
  VendorRate,
  VendorRateLog,
} from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';
import {
  ClientRateFuelAdjustmentService,
  ClientRateFuelSyncSource,
} from './client-rate-fuel-adjustment.service';

/** Rolling price history retained per vendor rate. */
/** Soft cap only for accidental runaway growth; history UI shows all rows. */
const VENDOR_RATE_LOG_LIMIT = 500;

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
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly clientRateFuelAdjustment: ClientRateFuelAdjustmentService,
  ) {}

  /**
   * Daily: flip due SCHEDULED rates to ACTIVE (one row per vendor+product).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledRateActivation() {
    this.logger.log('Running vendor rate activation cron...');
    const result = await this.activateDueRates();
    let clientRatesUpdated = 0;
    if (result.productIds.length > 0) {
      try {
        const sync = await this.clientRateFuelAdjustment.syncProducts(
          result.productIds,
          undefined,
          'cron',
        );
        clientRatesUpdated = sync.updated;
      } catch (error) {
        this.logger.error(
          'Client rate fuel sync after vendor rate cron failed',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    this.logger.log(
      `Vendor rate cron done — activated: ${result.activated}, clientRatesUpdated: ${clientRatesUpdated}`,
    );
  }

  /**
   * Activate due SCHEDULED rates (effectiveFromDate <= today) in place.
   * CANCELLED rates are never touched.
   */
  async activateDueRates(today = this.todayUtc()): Promise<{
    activated: number;
    expired: number;
    productIds: string[];
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
      return { activated: 0, expired: 0, productIds: [] };
    }

    let activated = 0;
    const activatedIds: string[] = [];
    const productIds = new Set<string>();

    for (const rate of dueScheduled) {
      rate.status = RateStatus.ACTIVE;
      await this.rateRepo.save(rate);
      activated += 1;
      activatedIds.push(rate.id);
      productIds.add(rate.productId);

      await this.activitiesService.logAction(
        {
          action: ActivityAction.UPDATE,
          module: ActivityModule.BILLING,
          entityType: 'VendorRate',
          entityId: rate.id,
          record: this.rateRecordLabel(rate),
          description: `Activated vendor rate ${rate.id}`,
          metadata: {
            status: RateStatus.ACTIVE,
            vendorId: rate.vendorId,
            productId: rate.productId,
            price: rate.price,
            effectiveFromDate: rate.effectiveFromDate,
            source: 'cron',
          },
          actorType: ActivityActorType.SYSTEM,
        },
        undefined,
      );
    }

    if (activated > 0) {
      await this.activitiesService.logAction(
        {
          action: ActivityAction.UPDATE,
          module: ActivityModule.BILLING,
          entityType: 'VendorRate',
          record: 'Scheduled rate activation',
          description: `Vendor rate cron activated ${activated}`,
          metadata: {
            activated,
            activatedIds,
          },
          actorType: ActivityActorType.SYSTEM,
        },
        undefined,
      );
    }

    return { activated, expired: 0, productIds: [...productIds] };
  }

  async create(dto: CreateVendorRateDto, activity?: ActivityActorContext) {
    await this.ensureVendor(dto.vendorId);
    await this.ensureProduct(dto.productId);
    await this.ensureUniqueRate(dto.vendorId, dto.productId);

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
        price: this.formatPrice(dto.price),
        effectiveFromDate,
        status,
      }),
    );

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
          price: rate.price,
          status: rate.status,
          effectiveFromDate: rate.effectiveFromDate,
        },
      },
      activity,
    );

    if (saved.status === RateStatus.ACTIVE) {
      await this.syncClientRatesForProducts([saved.productId], activity);
    }

    return rate;
  }

  /**
   * Bulk create rates for one vendor (transactional — all succeed or none).
   * One rate per product — duplicates rejected (use bulk update instead).
   */
  async createBulk(
    dto: BulkCreateVendorRateDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureVendor(dto.vendorId);

    const today = this.todayUtc();
    const seenProducts = new Set<string>();
    const prepared: Array<{
      vendorId: string;
      productId: string;
      locationName: string | null;
      price: string;
      effectiveFromDate: string;
      status: RateStatus;
    }> = [];

    for (let i = 0; i < dto.rates.length; i++) {
      const item = dto.rates[i];
      await this.ensureProduct(item.productId);

      if (seenProducts.has(item.productId)) {
        throw new ConflictException(
          `Duplicate productId in bulk payload at index ${i}`,
        );
      }
      seenProducts.add(item.productId);
      await this.ensureUniqueRate(dto.vendorId, item.productId);

      const effectiveFromDate = item.effectiveFromDate.slice(0, 10);
      let status = item.status ?? RateStatus.SCHEDULED;
      if (status === RateStatus.SCHEDULED && effectiveFromDate <= today) {
        status = RateStatus.ACTIVE;
      }

      prepared.push({
        vendorId: dto.vendorId,
        productId: item.productId,
        locationName: this.normalizeOptionalText(item.locationName),
        price: this.formatPrice(item.price),
        effectiveFromDate,
        status,
      });
    }

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(VendorRate);
      const saved = await repo.save(prepared.map((row) => repo.create(row)));
      return saved.map((row) => row.id);
    });

    const rates = await Promise.all(savedIds.map((id) => this.findOne(id)));
    const activeProductIds = rates
      .filter((r) => r.status === RateStatus.ACTIVE)
      .map((r) => r.productId);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: dto.vendorId,
        record: `Bulk vendor rates (${rates.length})`,
        description: `Created ${rates.length} vendor rate(s) in bulk`,
        metadata: {
          vendorId: dto.vendorId,
          count: rates.length,
          rateIds: savedIds,
        },
      },
      activity,
    );

    await this.syncClientRatesForProducts(activeProductIds, activity);

    return {
      data: rates,
      meta: { count: rates.length },
    };
  }

  /**
   * Bulk update rates for one vendor (transactional — all succeed or none).
   */
  async updateBulk(
    dto: BulkUpdateVendorRateDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureVendor(dto.vendorId);

    const ids = dto.rates.map((r) => r.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new ConflictException('Duplicate rate id in bulk payload');
    }

    const existing = await this.rateRepo.find({
      where: { id: In(ids), vendorId: dto.vendorId },
      relations: { vendor: true, product: true },
    });
    const byId = new Map(existing.map((r) => [r.id, r]));

    for (let i = 0; i < dto.rates.length; i++) {
      const item = dto.rates[i];
      if (!byId.has(item.id)) {
        throw new NotFoundException(
          `Vendor rate not found for this vendor at index ${i}: ${item.id}`,
        );
      }
      if (item.productId !== undefined) {
        await this.ensureProduct(item.productId);
      }
    }

    // Pre-validate product uniqueness when productId changes
    for (const item of dto.rates) {
      const current = byId.get(item.id)!;
      if (
        item.productId !== undefined &&
        item.productId !== current.productId
      ) {
        await this.ensureUniqueRate(dto.vendorId, item.productId, item.id);
      }
    }

    const priceLogs: Array<{
      id: string;
      previousPrice: string;
      previousEffectiveFromDate: string | null;
    }> = [];
    const productIdsToSync = new Set<string>();
    const today = this.todayUtc();

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(VendorRate);
      const logRepo = manager.getRepository(VendorRateLog);
      const updatedIds: string[] = [];

      for (const item of dto.rates) {
        const rate = await repo.findOne({ where: { id: item.id } });
        if (!rate || rate.vendorId !== dto.vendorId) {
          throw new NotFoundException(`Vendor rate not found: ${item.id}`);
        }

        const previousPrice = rate.price;
        const previousEffectiveFromDate = rate.effectiveFromDate
          ? String(rate.effectiveFromDate).slice(0, 10)
          : null;
        const previousProductId = rate.productId;
        const wasActive = rate.status === RateStatus.ACTIVE;

        this.applyVendorRateUpdates(rate, item);

        const priceChanged = rate.price !== previousPrice;

        // Same row stays; due SCHEDULED flips to ACTIVE in place
        if (
          rate.status === RateStatus.SCHEDULED &&
          rate.effectiveFromDate <= today
        ) {
          rate.status = RateStatus.ACTIVE;
        }

        await repo.save(rate);

        if (priceChanged) {
          priceLogs.push({
            id: rate.id,
            previousPrice,
            previousEffectiveFromDate,
          });
          await logRepo.save(
            logRepo.create({
              vendorRateId: rate.id,
              previousPrice,
              effectiveFromDate: previousEffectiveFromDate,
            }),
          );
        }

        if (wasActive || rate.status === RateStatus.ACTIVE) {
          productIdsToSync.add(previousProductId);
          productIdsToSync.add(rate.productId);
        }

        updatedIds.push(rate.id);
      }

      return updatedIds;
    });

    for (const log of priceLogs) {
      await this.pruneOldLogs(log.id);
    }

    const rates = await Promise.all(savedIds.map((id) => this.findOne(id)));

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRate',
        entityId: dto.vendorId,
        record: `Bulk vendor rates (${rates.length})`,
        description: `Updated ${rates.length} vendor rate(s) in bulk`,
        metadata: {
          vendorId: dto.vendorId,
          count: rates.length,
          rateIds: savedIds,
        },
      },
      activity,
    );

    await this.syncClientRatesForProducts([...productIdsToSync], activity);

    return {
      data: rates,
      meta: { count: rates.length },
    };
  }

  async findAll(query: VendorRateListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.vendor', 'vendor')
      .leftJoinAndSelect('vendor.city', 'vendorCity')
      .leftJoinAndSelect('vendor.state', 'vendorState')
      .leftJoinAndSelect('rate.product', 'product')
      .orderBy('rate.createdAt', 'DESC');

    if (query.vendorId) {
      qb.andWhere('rate.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.productId) {
      qb.andWhere('rate.productId = :productId', {
        productId: query.productId,
      });
    }
    // List never returns EXPIRED (price history). Those stay in detail logs only.
    qb.andWhere('rate.status != :expiredStatus', {
      expiredStatus: RateStatus.EXPIRED,
    });
    if (query.status && query.status !== RateStatus.EXPIRED) {
      qb.andWhere('rate.status = :status', { status: query.status });
    } else if (!query.status) {
      qb.andWhere('rate.status IN (:...currentStatuses)', {
        currentStatuses: [RateStatus.ACTIVE, RateStatus.SCHEDULED],
      });
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
          OR vendorCity.name ILIKE :search
          OR vendorState.name ILIKE :search
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
    status?: RateStatus;
  }) {
    await this.ensureVendor(opts.vendorId);
    await this.ensureProduct(opts.productId);

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.product', 'product')
      .where('rate.vendorId = :vendorId', { vendorId: opts.vendorId })
      .andWhere('rate.productId = :productId', { productId: opts.productId })
      .orderBy('rate.effectiveFromDate', 'DESC');

    qb.andWhere('rate.status = :status', {
      status: opts.status ?? RateStatus.ACTIVE,
    });

    const rows = await qb.getMany();

    return {
      data: rows.map((rate) => ({
        id: rate.id,
        vendorId: rate.vendorId,
        productId: rate.productId,
        locationName: rate.locationName ?? null,
        price: rate.price,
        effectiveFromDate: rate.effectiveFromDate,
        status: rate.status,
        product: rate.product
          ? { id: rate.product.id, name: rate.product.name }
          : null,
      })),
      /** Convenience: first ACTIVE rate price for form prefill (null if none). */
      suggestedRate: rows[0]?.price ?? null,
    };
  }

  /**
   * Highest vendor rate for a product as of `date`.
   * Price = latest segment where `effectiveFromDate <= date`
   * (current row + rate logs). Example: 1-Sep=400, 7-Sep=415 → 3-Sep → 400.
   */
  async getHighestRateForProductUtility(
    productId: string,
    opts: { date: string; vendorId?: string },
  ) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }

    const asOfDate = opts.date.slice(0, 10);
    if (opts.vendorId) {
      await this.ensureVendor(opts.vendorId);
    }

    // Do NOT filter by current rate.effectiveFromDate — history may live in logs
    // when the current window starts after `date` (e.g. current from 7-Sep, query 3-Sep).
    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.vendor', 'vendor')
      .where('rate.productId = :productId', { productId });

    if (opts.vendorId) {
      qb.andWhere('rate.vendorId = :vendorId', { vendorId: opts.vendorId });
    }

    const rates = await qb.getMany();
    if (!rates.length) {
      return {
        productId: product.id,
        product: { id: product.id, name: product.name },
        date: asOfDate,
        vendorId: opts.vendorId ?? null,
        highestPrice: null,
        rate: null,
      };
    }

    const logsByRateId = await this.loadLogsByRateIds(rates.map((r) => r.id));

    let best: {
      rate: VendorRate;
      priceAsOf: string;
      effectiveFromAsOf: string;
    } | null = null;

    for (const rate of rates) {
      const resolved = this.priceAsOfDate(
        rate,
        asOfDate,
        logsByRateId.get(rate.id) ?? [],
      );
      if (!resolved) continue;

      if (
        !best ||
        Number(resolved.price) > Number(best.priceAsOf) ||
        (Number(resolved.price) === Number(best.priceAsOf) &&
          (resolved.effectiveFromDate > best.effectiveFromAsOf ||
            (resolved.effectiveFromDate === best.effectiveFromAsOf &&
              rate.createdAt > best.rate.createdAt)))
      ) {
        best = {
          rate,
          priceAsOf: resolved.price,
          effectiveFromAsOf: resolved.effectiveFromDate,
        };
      }
    }

    return {
      productId: product.id,
      product: {
        id: product.id,
        name: product.name,
      },
      date: asOfDate,
      vendorId: opts.vendorId ?? null,
      highestPrice: best?.priceAsOf ?? null,
      rate: best
        ? {
            id: best.rate.id,
            vendorId: best.rate.vendorId,
            vendor: best.rate.vendor
              ? {
                  id: best.rate.vendor.id,
                  vendorName: best.rate.vendor.vendorName,
                  ownerName: best.rate.vendor.ownerName,
                }
              : null,
            productId: best.rate.productId,
            locationName: best.rate.locationName ?? null,
            /** Current row price (may differ from as-of). */
            price: best.rate.price,
            /** Price applicable on `date` (from logs / current row). */
            priceAsOf: best.priceAsOf,
            /** Segment `effectiveFromDate` that applied on `date`. */
            effectiveFromDate: best.effectiveFromAsOf,
            /** Current row’s effectiveFromDate. */
            currentEffectiveFromDate: best.rate.effectiveFromDate,
            status: best.rate.status,
          }
        : null,
    };
  }

  /**
   * Price on `asOfDate` via `effectiveFromDate` segments only:
   * - current row: (rate.effectiveFromDate → rate.price)
   * - each log: (log.effectiveFromDate → log.previousPrice)
   * Pick latest segment where effectiveFromDate <= asOfDate.
   *
   * 1-Sep=400, 7-Sep=415 → asOf 3-Sep → 400.
   */
  private priceAsOfDate(
    rate: VendorRate,
    asOfDate: string,
    logs: VendorRateLog[],
  ): { price: string; effectiveFromDate: string } | null {
    type Segment = { from: string; price: string; at: number };

    const segments: Segment[] = [];

    const currentFrom = String(rate.effectiveFromDate).slice(0, 10);
    if (currentFrom && rate.price !== undefined && rate.price !== null) {
      segments.push({
        from: currentFrom,
        price: String(rate.price),
        at: new Date(rate.updatedAt ?? rate.createdAt).getTime(),
      });
    }

    for (const log of logs) {
      const from = log.effectiveFromDate
        ? String(log.effectiveFromDate).slice(0, 10)
        : null;
      if (
        !from ||
        log.previousPrice === undefined ||
        log.previousPrice === null ||
        log.previousPrice === ''
      ) {
        continue;
      }
      segments.push({
        from,
        price: String(log.previousPrice),
        at: new Date(log.createdAt).getTime(),
      });
    }

    const applicable = segments
      .filter((s) => s.from <= asOfDate)
      .sort((a, b) => {
        const byFrom = b.from.localeCompare(a.from);
        return byFrom !== 0 ? byFrom : b.at - a.at;
      });

    if (!applicable.length) return null;

    return {
      price: applicable[0].price,
      effectiveFromDate: applicable[0].from,
    };
  }

  private async loadLogsByRateIds(
    rateIds: string[],
  ): Promise<Map<string, VendorRateLog[]>> {
    const map = new Map<string, VendorRateLog[]>();
    if (!rateIds.length) return map;

    const logs = await this.logRepo.find({
      where: { vendorRateId: In(rateIds) },
      order: { createdAt: 'DESC' },
    });

    for (const log of logs) {
      const list = map.get(log.vendorRateId) ?? [];
      list.push(log);
      map.set(log.vendorRateId, list);
    }
    return map;
  }

  async findLogs(id: string) {
    await this.findByIdOrFail(id);
    const logs = await this.getRecentLogs(id);
    return { data: logs };
  }

  /**
   * Manually add a vendor rate log row.
   * History is ordered by `effectiveFromDate` DESC.
   */
  async createLog(
    rateId: string,
    dto: CreateVendorRateLogDto,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(rateId);

    const saved = await this.logRepo.save(
      this.logRepo.create({
        vendorRateId: rateId,
        previousPrice: this.formatPrice(dto.previousPrice),
        effectiveFromDate: dto.effectiveFromDate.slice(0, 10),
      }),
    );

    await this.pruneOldLogs(rateId);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRateLog',
        entityId: saved.id,
        record: `Vendor rate log ${saved.id.slice(0, 8)}`,
        description: `Created vendor rate log for rate ${rateId}`,
        metadata: {
          vendorRateId: rateId,
          logId: saved.id,
          previousPrice: saved.previousPrice ?? null,
          effectiveFromDate: saved.effectiveFromDate
            ? String(saved.effectiveFromDate).slice(0, 10)
            : null,
        },
      },
      activity,
    );

    return saved;
  }

  /**
   * Update a vendor rate log row (previousPrice / effectiveFromDate).
   * `rateId` must own `logId`.
   */
  async updateLog(
    rateId: string,
    logId: string,
    dto: UpdateVendorRateLogDto,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(rateId);

    if (
      dto.previousPrice === undefined &&
      dto.effectiveFromDate === undefined
    ) {
      throw new BadRequestException(
        'Provide previousPrice and/or effectiveFromDate to update',
      );
    }

    const log = await this.logRepo.findOne({
      where: { id: logId, vendorRateId: rateId },
    });
    if (!log) {
      throw new NotFoundException('Vendor rate log not found');
    }

    const before = {
      previousPrice: log.previousPrice ?? null,
      effectiveFromDate: log.effectiveFromDate
        ? String(log.effectiveFromDate).slice(0, 10)
        : null,
    };

    if (dto.previousPrice !== undefined) {
      log.previousPrice =
        dto.previousPrice === null
          ? null
          : this.formatPrice(dto.previousPrice);
    }
    if (dto.effectiveFromDate !== undefined) {
      log.effectiveFromDate =
        dto.effectiveFromDate === null || dto.effectiveFromDate === ''
          ? null
          : dto.effectiveFromDate.slice(0, 10);
    }

    const saved = await this.logRepo.save(log);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRateLog',
        entityId: saved.id,
        record: `Vendor rate log ${saved.id.slice(0, 8)}`,
        description: `Updated vendor rate log for rate ${rateId}`,
        metadata: {
          vendorRateId: rateId,
          logId: saved.id,
          before,
          after: {
            previousPrice: saved.previousPrice ?? null,
            effectiveFromDate: saved.effectiveFromDate
              ? String(saved.effectiveFromDate).slice(0, 10)
              : null,
          },
        },
      },
      activity,
    );

    return saved;
  }

  /**
   * Delete a vendor rate log row. `rateId` must own `logId`.
   */
  async deleteLog(
    rateId: string,
    logId: string,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(rateId);

    const log = await this.logRepo.findOne({
      where: { id: logId, vendorRateId: rateId },
    });
    if (!log) {
      throw new NotFoundException('Vendor rate log not found');
    }

    const snapshot = {
      previousPrice: log.previousPrice ?? null,
      effectiveFromDate: log.effectiveFromDate
        ? String(log.effectiveFromDate).slice(0, 10)
        : null,
    };

    await this.logRepo.remove(log);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.BILLING,
        entityType: 'VendorRateLog',
        entityId: logId,
        record: `Vendor rate log ${logId.slice(0, 8)}`,
        description: `Deleted vendor rate log for rate ${rateId}`,
        metadata: {
          vendorRateId: rateId,
          logId,
          ...snapshot,
        },
      },
      activity,
    );

    return { message: 'Vendor rate log deleted' };
  }

  async update(
    id: string,
    dto: UpdateVendorRateDto,
    activity?: ActivityActorContext,
  ) {
    const rate = await this.findByIdOrFail(id);
    const previousPrice = rate.price;
    const previousEffectiveFromDate = rate.effectiveFromDate
      ? String(rate.effectiveFromDate).slice(0, 10)
      : null;
    const previousProductId = rate.productId;
    const wasActive = rate.status === RateStatus.ACTIVE;

    if (dto.vendorId !== undefined) {
      await this.ensureVendor(dto.vendorId);
      rate.vendorId = dto.vendorId;
    }
    if (dto.productId !== undefined) {
      await this.ensureProduct(dto.productId);
      rate.productId = dto.productId;
    }

    const nextVendorId = rate.vendorId;
    const nextProductId = rate.productId;
    if (
      dto.vendorId !== undefined ||
      dto.productId !== undefined
    ) {
      await this.ensureUniqueRate(nextVendorId, nextProductId, id);
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

    const priceChanged = rate.price !== previousPrice;

    // Same row stays; due SCHEDULED flips to ACTIVE in place (no new row)
    if (
      rate.status === RateStatus.SCHEDULED &&
      rate.effectiveFromDate <= this.todayUtc()
    ) {
      rate.status = RateStatus.ACTIVE;
    }

    await this.rateRepo.save(rate);

    if (priceChanged) {
      await this.writeLog(
        rate.id,
        previousPrice,
        previousEffectiveFromDate,
      );
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
          price: updated.price,
          previousPrice: priceChanged ? previousPrice : undefined,
          previousEffectiveFromDate: priceChanged
            ? previousEffectiveFromDate
            : undefined,
          status: updated.status,
          effectiveFromDate: updated.effectiveFromDate,
        },
      },
      activity,
    );

    const productIds: string[] = [];
    if (wasActive || updated.status === RateStatus.ACTIVE) {
      productIds.push(previousProductId, updated.productId);
    }
    await this.syncClientRatesForProducts(productIds, activity);

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
        },
      },
      activity,
    );

    await this.syncClientRatesForProducts([updated.productId], activity);

    return updated;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const rate = await this.findByIdOrFail(id);
    const productId = rate.productId;
    const wasActive = rate.status === RateStatus.ACTIVE;
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
          price: rate.price,
          status: rate.status,
        },
      },
      activity,
    );

    if (wasActive) {
      await this.syncClientRatesForProducts([productId], activity);
    }

    return { message: 'Vendor rate deleted' };
  }

  private async syncClientRatesForProducts(
    productIds: Array<string | null | undefined>,
    activity?: ActivityActorContext,
    source: ClientRateFuelSyncSource = 'vendor-rate',
  ): Promise<void> {
    const ids = [...new Set(productIds.filter((id): id is string => !!id))];
    if (ids.length === 0) {
      return;
    }
    await this.clientRateFuelAdjustment.syncProducts(ids, activity, source);
  }

  private rateRecordLabel(
    rate: Pick<VendorRate, 'locationName' | 'price' | 'id'> & {
      vendor?: Pick<Vendor, 'ownerName' | 'vendorName'> | null;
      product?: Pick<VendorProduct, 'name'> | null;
    },
  ): string {
    const vendorLabel =
      rate.vendor?.vendorName?.trim() ||
      rate.vendor?.ownerName?.trim() ||
      null;
    const parts = [
      vendorLabel,
      rate.product?.name,
      rate.locationName,
      rate.price != null ? `$${rate.price}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : rate.id;
  }

  private applyVendorRateUpdates(
    rate: VendorRate,
    dto: Pick<
      BulkUpdateVendorRateItemDto,
      'productId' | 'locationName' | 'price' | 'effectiveFromDate'
    >,
  ): void {
    if (dto.productId !== undefined) {
      rate.productId = dto.productId;
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
  }

  /** One rate row per vendor + product (client-rate style — no duplicates). */
  private async ensureUniqueRate(
    vendorId: string,
    productId: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.rateRepo.findOne({
      where: { vendorId, productId },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'A rate already exists for this vendor and product — update it instead of creating a duplicate',
      );
    }
  }

  private async writeLog(
    vendorRateId: string,
    previousPrice: string | null,
    /** Previous (last) rate row's effectiveFromDate. */
    effectiveFromDate?: string | null,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        vendorRateId,
        previousPrice,
        effectiveFromDate: effectiveFromDate
          ? String(effectiveFromDate).slice(0, 10)
          : null,
      }),
    );

    await this.pruneOldLogs(vendorRateId);
  }

  private async pruneOldLogs(vendorRateId: string): Promise<void> {
    // Keep latest by effectiveFromDate (same order as history UI).
    const keep = await this.logRepo
      .createQueryBuilder('log')
      .select('log.id', 'id')
      .where('log.vendorRateId = :vendorRateId', { vendorRateId })
      .orderBy('log.effectiveFromDate', 'DESC', 'NULLS LAST')
      .addOrderBy('log.createdAt', 'DESC')
      .take(VENDOR_RATE_LOG_LIMIT)
      .getRawMany<{ id: string }>();

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

  /** History: `effectiveFromDate` DESC, then `createdAt` DESC. */
  private async getRecentLogs(vendorRateId: string): Promise<VendorRateLog[]> {
    return this.logRepo
      .createQueryBuilder('log')
      .where('log.vendorRateId = :vendorRateId', { vendorRateId })
      .orderBy('log.effectiveFromDate', 'DESC', 'NULLS LAST')
      .addOrderBy('log.createdAt', 'DESC')
      .getMany();
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async findByIdOrFail(id: string): Promise<VendorRate> {
    const rate = await this.rateRepo.findOne({
      where: { id },
      relations: {
        vendor: { city: true, state: true },
        product: true,
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
