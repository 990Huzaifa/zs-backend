import {
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
  UpdateVendorRateDto,
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
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly clientRateFuelAdjustment: ClientRateFuelAdjustmentService,
  ) {}

  /**
   * Daily: activate SCHEDULED rates whose effectiveFromDate has arrived,
   * and expire any previously ACTIVE rate for the same vendor+product.
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
      `Vendor rate cron done — activated: ${result.activated}, expired: ${result.expired}, clientRatesUpdated: ${clientRatesUpdated}`,
    );
  }

  /**
   * Activate all due SCHEDULED rates (effectiveFromDate <= today).
   * Per vendor+product, the latest due rate becomes ACTIVE;
   * prior ACTIVE / other due SCHEDULED in that group become EXPIRED.
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

    const groups = new Map<string, VendorRate[]>();
    for (const rate of dueScheduled) {
      const key = this.rateGroupKey(rate.vendorId, rate.productId);
      const list = groups.get(key) ?? [];
      list.push(rate);
      groups.set(key, list);
    }

    let activated = 0;
    let expired = 0;
    const activatedIds: string[] = [];
    const productIds = new Set<string>();

    for (const rates of groups.values()) {
      const winner = rates[0];
      const supersededDue = rates.slice(1);

      const previousActive = await this.rateRepo.find({
        where: {
          vendorId: winner.vendorId,
          productId: winner.productId,
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
        productIds.add(winner.productId);
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
        productIds.add(winner.productId);

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

    return { activated, expired, productIds: [...productIds] };
  }

  async create(dto: CreateVendorRateDto, activity?: ActivityActorContext) {
    await this.ensureVendor(dto.vendorId);
    await this.ensureProduct(dto.productId);

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
   */
  async createBulk(
    dto: BulkCreateVendorRateDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureVendor(dto.vendorId);

    const today = this.todayUtc();
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

      const logRepo = manager.getRepository(VendorRateLog);
      for (const rate of saved) {
        if (rate.status === RateStatus.ACTIVE) {
          await this.expireOtherActiveRatesInRepo(repo, rate, logRepo, false);
        }
      }

      return saved.map((row) => row.id);
    });

    for (const id of savedIds) {
      await this.pruneOldLogs(id);
    }

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

    const priceLogs: Array<{ id: string; previousPrice: string }> = [];
    const productIdsToSync = new Set<string>();
    let needsActivation = false;

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
        const previousProductId = rate.productId;
        const wasActive = rate.status === RateStatus.ACTIVE;
        let priceChanged = false;

        this.applyVendorRateUpdates(rate, item);

        if (rate.price !== previousPrice) {
          priceChanged = true;
        }

        await repo.save(rate);

        if (priceChanged) {
          priceLogs.push({ id: rate.id, previousPrice });
          await logRepo.save(
            logRepo.create({
              vendorRateId: rate.id,
              previousPrice,
            }),
          );
        }

        if (
          rate.status === RateStatus.SCHEDULED &&
          rate.effectiveFromDate <= this.todayUtc()
        ) {
          needsActivation = true;
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

    let activatedProductIds: string[] = [];
    if (needsActivation) {
      const activation = await this.activateDueRates();
      activatedProductIds = activation.productIds;
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

    await this.syncClientRatesForProducts(
      [...productIdsToSync, ...activatedProductIds],
      activity,
    );

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
   * Highest ACTIVE vendor rate for a product across all vendors.
   */
  async getHighestRateForProductUtility(productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }

    const rate = await this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.vendor', 'vendor')
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
            locationName: rate.locationName ?? null,
            price: rate.price,
            effectiveFromDate: rate.effectiveFromDate,
            status: rate.status,
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
    const previousProductId = rate.productId;
    const wasActive = rate.status === RateStatus.ACTIVE;
    let priceChanged = false;

    if (dto.vendorId !== undefined) {
      await this.ensureVendor(dto.vendorId);
      rate.vendorId = dto.vendorId;
    }
    if (dto.productId !== undefined) {
      await this.ensureProduct(dto.productId);
      rate.productId = dto.productId;
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

    let activatedProductIds: string[] = [];
    if (
      rate.status === RateStatus.SCHEDULED &&
      rate.effectiveFromDate <= this.todayUtc()
    ) {
      const activation = await this.activateDueRates();
      activatedProductIds = activation.productIds;
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
          status: updated.status,
          effectiveFromDate: updated.effectiveFromDate,
        },
      },
      activity,
    );

    const productIds = [...activatedProductIds];
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

  private async expireOtherActiveRates(rate: VendorRate): Promise<void> {
    await this.expireOtherActiveRatesInRepo(
      this.rateRepo,
      rate,
      this.logRepo,
      true,
    );
  }

  private async expireOtherActiveRatesInRepo(
    repo: Repository<VendorRate>,
    rate: VendorRate,
    logRepo: Repository<VendorRateLog>,
    pruneLogs: boolean,
  ): Promise<void> {
    const others = await repo.find({
      where: {
        vendorId: rate.vendorId,
        productId: rate.productId,
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
      await repo.save(other);
    }

    if (supersededPrice !== null && supersededPrice !== rate.price) {
      await logRepo.save(
        logRepo.create({
          vendorRateId: rate.id,
          previousPrice: supersededPrice,
        }),
      );
      if (pruneLogs) {
        await this.pruneOldLogs(rate.id);
      }
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

  private rateGroupKey(vendorId: string, productId: string): string {
    return `${vendorId}:${productId}`;
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
