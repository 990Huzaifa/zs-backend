import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  BulkCreateClientRateDto,
  BulkUpdateClientRateDto,
  BulkUpdateClientRateItemDto,
  ClientRateListQueryDto,
  CreateClientRateDto,
  CreateClientRateItemDto,
  UpdateClientRateDto,
} from '../auth/dto/client-rate.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Client,
  ClientDropoffLocation,
  ClientPickupLocation,
  ClientRate,
  ClientRateLog,
  ClientStatus,
} from '../database/entities/client.entity';
import {
  Vehicle,
  VehicleCapacity,
  VehicleSize,
  VehicleType,
  VehicleTypeMeasurement,
} from '../database/entities/vehicle.entity';
import { VendorProduct } from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

/** Rolling price history retained per client rate. */
const CLIENT_RATE_LOG_LIMIT = 10;

type ClientRatePricing = Pick<
  ClientRate,
  | 'fuelRate'
  | 'freightRate'
  | 'fixedRate'
  | 'variableRate'
  | 'fixedRatePercentage'
  | 'variableRatePercentage'
>;

@Injectable()
export class ClientRatesService {
  constructor(
    @InjectRepository(ClientRate)
    private readonly rateRepo: Repository<ClientRate>,
    @InjectRepository(ClientRateLog)
    private readonly logRepo: Repository<ClientRateLog>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(VehicleType)
    private readonly typeRepo: Repository<VehicleType>,
    @InjectRepository(VehicleSize)
    private readonly sizeRepo: Repository<VehicleSize>,
    @InjectRepository(VehicleCapacity)
    private readonly capacityRepo: Repository<VehicleCapacity>,
    @InjectRepository(ClientPickupLocation)
    private readonly pickupRepo: Repository<ClientPickupLocation>,
    @InjectRepository(ClientDropoffLocation)
    private readonly dropoffRepo: Repository<ClientDropoffLocation>,
    @InjectRepository(VendorProduct)
    private readonly vendorProductRepo: Repository<VendorProduct>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Trip create — ACTIVE clients that have rates matching this vehicle's
   * type + size/capacity (and optional pickup/dropoff).
   */
  async listClientsUtilityForVehicle(
    vehicleId: string,
    opts: {
      pickupLocationId?: string;
      dropoffLocationId?: string;
      search?: string;
    } = {},
  ) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
      relations: {
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (!vehicle.vehicleTypeId) {
      return {
        data: [],
        vehicle: this.toVehicleUtilityMeta(vehicle),
      };
    }

    const type = await this.typeRepo.findOne({
      where: { id: vehicle.vehicleTypeId },
    });
    if (!type) {
      return {
        data: [],
        vehicle: this.toVehicleUtilityMeta(vehicle),
      };
    }

    const needsSize =
      type.measurement === VehicleTypeMeasurement.SIZE &&
      !vehicle.vehicleSizeId;
    const needsCapacity =
      type.measurement === VehicleTypeMeasurement.CAPACITY &&
      !vehicle.vehicleCapacityId;
    if (needsSize || needsCapacity) {
      return {
        data: [],
        vehicle: this.toVehicleUtilityMeta(vehicle),
      };
    }

    const result = await this.listClientsUtilityByMasters({
      vehicleTypeId: vehicle.vehicleTypeId,
      vehicleSizeId: vehicle.vehicleSizeId ?? null,
      vehicleCapacityId: vehicle.vehicleCapacityId ?? null,
      pickupLocationId: opts.pickupLocationId,
      dropoffLocationId: opts.dropoffLocationId,
      search: opts.search,
    });

    return {
      ...result,
      vehicle: this.toVehicleUtilityMeta(vehicle),
    };
  }

  /**
   * Trip create — ACTIVE clients with rates for type + size/capacity.
   */
  async listClientsUtilityByMasters(opts: {
    vehicleTypeId: string;
    vehicleSizeId?: string | null;
    vehicleCapacityId?: string | null;
    pickupLocationId?: string;
    dropoffLocationId?: string;
    search?: string;
  }) {
    const type = await this.typeRepo.findOne({
      where: { id: opts.vehicleTypeId, isActive: true },
    });
    if (!type) {
      throw new NotFoundException('Vehicle type not found or inactive');
    }

    let sizeId: string | null = null;
    let capacityId: string | null = null;

    if (type.measurement === VehicleTypeMeasurement.SIZE) {
      if (!opts.vehicleSizeId) {
        throw new BadRequestException(
          'vehicleSizeId is required when type measurement is SIZE',
        );
      }
      const size = await this.sizeRepo.findOne({
        where: { id: opts.vehicleSizeId, isActive: true },
      });
      if (!size) {
        throw new NotFoundException('Vehicle size not found or inactive');
      }
      sizeId = size.id;
    } else {
      if (!opts.vehicleCapacityId) {
        throw new BadRequestException(
          'vehicleCapacityId is required when type measurement is CAPACITY',
        );
      }
      const capacity = await this.capacityRepo.findOne({
        where: { id: opts.vehicleCapacityId, isActive: true },
      });
      if (!capacity) {
        throw new NotFoundException('Vehicle capacity not found or inactive');
      }
      capacityId = capacity.id;
    }

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .innerJoinAndSelect('rate.client', 'client')
      .leftJoinAndSelect('rate.pickupLocation', 'pickupLocation')
      .leftJoinAndSelect('rate.dropoffLocation', 'dropoffLocation')
      .leftJoinAndSelect('rate.vendorProduct', 'vendorProduct')
      .where('rate.vehicleTypeId = :vehicleTypeId', {
        vehicleTypeId: type.id,
      })
      .andWhere('client.status = :clientStatus', {
        clientStatus: ClientStatus.ACTIVE,
      })
      .orderBy('client.companyName', 'ASC')
      .addOrderBy('rate.freightRate', 'ASC');

    if (sizeId) {
      qb.andWhere('rate.vehicleSizeId = :vehicleSizeId', {
        vehicleSizeId: sizeId,
      });
    } else {
      qb.andWhere('rate.vehicleSizeId IS NULL');
    }

    if (capacityId) {
      qb.andWhere('rate.vehicleCapacityId = :vehicleCapacityId', {
        vehicleCapacityId: capacityId,
      });
    } else {
      qb.andWhere('rate.vehicleCapacityId IS NULL');
    }

    if (opts.pickupLocationId) {
      qb.andWhere('rate.pickupLocationId = :pickupLocationId', {
        pickupLocationId: opts.pickupLocationId,
      });
    }
    if (opts.dropoffLocationId) {
      qb.andWhere('rate.dropoffLocationId = :dropoffLocationId', {
        dropoffLocationId: opts.dropoffLocationId,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          client.companyName ILIKE :search
          OR client.email ILIKE :search
          OR pickupLocation.name ILIKE :search
          OR dropoffLocation.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rates = await qb.getMany();

    const byClient = new Map<
      string,
      {
        id: string;
        label: string;
        companyName: string;
        email: string | null;
        companyAddress: string;
        rates: Array<ReturnType<ClientRatesService['toUtilityRate']>>;
      }
    >();

    for (const rate of rates) {
      if (!rate.client) continue;
      let entry = byClient.get(rate.clientId);
      if (!entry) {
        entry = {
          id: rate.client.id,
          label: rate.client.companyName,
          companyName: rate.client.companyName,
          email: rate.client.email ?? null,
          companyAddress: rate.client.companyAddress,
          rates: [],
        };
        byClient.set(rate.clientId, entry);
      }
      entry.rates.push(this.toUtilityRate(rate));
    }

    return {
      data: [...byClient.values()],
      filter: {
        vehicleTypeId: type.id,
        vehicleSizeId: sizeId,
        vehicleCapacityId: capacityId,
        measurement: type.measurement,
        vehicleType: {
          id: type.id,
          name: type.name,
          measurement: type.measurement,
        },
      },
    };
  }

  private toVehicleUtilityMeta(vehicle: Vehicle) {
    return {
      id: vehicle.id,
      regNo: vehicle.regNo,
      vehicleTypeId: vehicle.vehicleTypeId ?? null,
      vehicleSizeId: vehicle.vehicleSizeId ?? null,
      vehicleCapacityId: vehicle.vehicleCapacityId ?? null,
      vehicleType: vehicle.vehicleType
        ? {
            id: vehicle.vehicleType.id,
            name: vehicle.vehicleType.name,
            measurement: vehicle.vehicleType.measurement,
          }
        : null,
      vehicleSize: vehicle.vehicleSize
        ? { id: vehicle.vehicleSize.id, name: vehicle.vehicleSize.name }
        : null,
      vehicleCapacity: vehicle.vehicleCapacity
        ? {
            id: vehicle.vehicleCapacity.id,
            name: vehicle.vehicleCapacity.name,
          }
        : null,
    };
  }

  private toUtilityRate(rate: ClientRate) {
    return {
      id: rate.id,
      pickupLocationId: rate.pickupLocationId,
      dropoffLocationId: rate.dropoffLocationId,
      vendorProductId: rate.vendorProductId,
      fuelRate: rate.fuelRate,
      freightRate: rate.freightRate,
      fixedRate: rate.fixedRate,
      variableRate: rate.variableRate,
      fixedRatePercentage: rate.fixedRatePercentage,
      variableRatePercentage: rate.variableRatePercentage,
      effectiveFromDate: rate.effectiveFromDate ?? null,
      pickupLocation: rate.pickupLocation
        ? {
            id: rate.pickupLocation.id,
            name: rate.pickupLocation.name,
            address: rate.pickupLocation.address,
          }
        : null,
      dropoffLocation: rate.dropoffLocation
        ? {
            id: rate.dropoffLocation.id,
            name: rate.dropoffLocation.name,
            address: rate.dropoffLocation.address,
          }
        : null,
      vendorProduct: rate.vendorProduct
        ? {
            id: rate.vendorProduct.id,
            name: rate.vendorProduct.name,
          }
        : null,
    };
  }

  async create(dto: CreateClientRateDto, activity?: ActivityActorContext) {
    const prepared = await this.prepareRateEntity(dto.clientId, dto);

    const saved = await this.rateRepo.save(this.rateRepo.create(prepared));
    const rate = await this.findOne(saved.id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'ClientRate',
        entityId: rate.id,
        record: this.rateRecordLabel(rate),
        description: `Created client rate ${this.rateRecordLabel(rate)}`,
        metadata: {
          clientId: rate.clientId,
          vehicleTypeId: rate.vehicleTypeId,
          vehicleSizeId: rate.vehicleSizeId,
          vehicleCapacityId: rate.vehicleCapacityId,
          pickupLocationId: rate.pickupLocationId,
          dropoffLocationId: rate.dropoffLocationId,
          vendorProductId: rate.vendorProductId,
          fuelRate: rate.fuelRate,
          freightRate: rate.freightRate,
          fixedRate: rate.fixedRate,
          variableRate: rate.variableRate,
          fixedRatePercentage: rate.fixedRatePercentage,
          variableRatePercentage: rate.variableRatePercentage,
          effectiveFromDate: rate.effectiveFromDate,
        },
      },
      activity,
    );

    return rate;
  }

  /**
   * Bulk store rates for one client (transactional — all succeed or none).
   */
  async createBulk(
    dto: BulkCreateClientRateDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClient(dto.clientId);

    const preparedRows: Array<ReturnType<ClientRatesService['toPersistable']>> =
      [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < dto.rates.length; i++) {
      const item = dto.rates[i];
      const prepared = await this.prepareRateEntity(dto.clientId, item, {
        skipClientCheck: true,
        skipDbUniqueCheck: true,
      });

      const key = this.uniqueRateKey(
        prepared.clientId,
        prepared.vehicleTypeId,
        prepared.vehicleSizeId,
        prepared.vehicleCapacityId,
        prepared.pickupLocationId,
        prepared.dropoffLocationId,
        prepared.vendorProductId,
      );

      if (seenKeys.has(key)) {
        throw new ConflictException(
          `Duplicate rate in bulk payload at index ${i} (same vehicle, pickup/dropoff, and vendor product)`,
        );
      }
      seenKeys.add(key);

      await this.ensureUniqueRate(
        prepared.clientId,
        prepared.vehicleTypeId,
        prepared.vehicleSizeId,
        prepared.vehicleCapacityId,
        prepared.pickupLocationId,
        prepared.dropoffLocationId,
        prepared.vendorProductId,
      );

      preparedRows.push(prepared);
    }

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientRate);
      const entities = preparedRows.map((row) => repo.create(row));
      const saved = await repo.save(entities);
      return saved.map((row) => row.id);
    });

    const rates = await Promise.all(savedIds.map((id) => this.findOne(id)));

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.BILLING,
        entityType: 'ClientRate',
        entityId: dto.clientId,
        record: `Bulk client rates (${rates.length})`,
        description: `Created ${rates.length} client rate(s) in bulk`,
        metadata: {
          clientId: dto.clientId,
          count: rates.length,
          rateIds: savedIds,
        },
      },
      activity,
    );

    return {
      data: rates,
      meta: { count: rates.length },
    };
  }

  /**
   * Bulk update rates for one client (transactional — all succeed or none).
   * Pricing change → log previous freight on the same row.
   */
  async updateBulk(
    dto: BulkUpdateClientRateDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClient(dto.clientId);

    const ids = dto.rates.map((r) => r.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new ConflictException('Duplicate rate id in bulk payload');
    }

    const existing = await this.rateRepo.find({
      where: { id: In(ids), clientId: dto.clientId },
    });
    const byId = new Map(existing.map((r) => [r.id, r]));

    for (let i = 0; i < dto.rates.length; i++) {
      const item = dto.rates[i];
      if (!byId.has(item.id)) {
        throw new NotFoundException(
          `Client rate not found for this client at index ${i}: ${item.id}`,
        );
      }
    }

    const logEntries: Array<{
      clientRateId: string;
      previousPrice: string;
      effectiveFromDate: string | null;
      effectiveToDate: string;
    }> = [];
    const seenKeys = new Set<string>();

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientRate);
      const logRepo = manager.getRepository(ClientRateLog);
      const updatedIds: string[] = [];

      for (let i = 0; i < dto.rates.length; i++) {
        const item = dto.rates[i];
        const rate = await repo.findOne({ where: { id: item.id } });
        if (!rate || rate.clientId !== dto.clientId) {
          throw new NotFoundException(`Client rate not found: ${item.id}`);
        }

        const previousPricing = this.pickPricing(rate);
        const previousEffectiveFrom = rate.effectiveFromDate;

        await this.applyClientRateUpdates(rate, item);

        const key = this.uniqueRateKey(
          rate.clientId,
          rate.vehicleTypeId,
          rate.vehicleSizeId ?? null,
          rate.vehicleCapacityId ?? null,
          rate.pickupLocationId,
          rate.dropoffLocationId,
          rate.vendorProductId,
        );
        if (seenKeys.has(key)) {
          throw new ConflictException(
            `Duplicate rate key in bulk payload at index ${i} (same vehicle, pickup/dropoff, and vendor product)`,
          );
        }
        seenKeys.add(key);

        await this.ensureUniqueRate(
          rate.clientId,
          rate.vehicleTypeId,
          rate.vehicleSizeId ?? null,
          rate.vehicleCapacityId ?? null,
          rate.pickupLocationId,
          rate.dropoffLocationId,
          rate.vendorProductId,
          rate.id,
        );

        const pricingChanged = this.hasPricingChanged(
          previousPricing,
          this.pickPricing(rate),
        );

        await repo.save(rate);

        if (pricingChanged) {
          const effectiveFromDate = previousEffectiveFrom
            ? String(previousEffectiveFrom).slice(0, 10)
            : null;
          const effectiveToDate = rate.effectiveFromDate
            ? String(rate.effectiveFromDate).slice(0, 10)
            : this.todayUtc();

          logEntries.push({
            clientRateId: rate.id,
            previousPrice: previousPricing.freightRate,
            effectiveFromDate,
            effectiveToDate,
          });

          await logRepo.save(
            logRepo.create({
              clientRateId: rate.id,
              previousPrice: previousPricing.freightRate,
              effectiveFromDate: effectiveFromDate as unknown as Date | null,
              effectiveToDate: effectiveToDate as unknown as Date | null,
            }),
          );
        }

        updatedIds.push(rate.id);
      }

      return updatedIds;
    });

    for (const entry of logEntries) {
      await this.pruneOldLogs(entry.clientRateId);
    }

    const rates = await Promise.all(savedIds.map((id) => this.findOne(id)));

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'ClientRate',
        entityId: dto.clientId,
        record: `Bulk client rates (${rates.length})`,
        description: `Updated ${rates.length} client rate(s) in bulk`,
        metadata: {
          clientId: dto.clientId,
          count: rates.length,
          rateIds: savedIds,
        },
      },
      activity,
    );

    return {
      data: rates,
      meta: { count: rates.length },
    };
  }

  async findAll(query: ClientRateListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.client', 'client')
      .leftJoinAndSelect('rate.vehicleType', 'vehicleType')
      .leftJoinAndSelect('rate.vehicleSize', 'vehicleSize')
      .leftJoinAndSelect('rate.vehicleCapacity', 'vehicleCapacity')
      .leftJoinAndSelect('rate.pickupLocation', 'pickupLocation')
      .leftJoinAndSelect('rate.dropoffLocation', 'dropoffLocation')
      .leftJoinAndSelect('rate.vendorProduct', 'vendorProduct')
      .orderBy('rate.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.clientId) {
      qb.andWhere('rate.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.vehicleTypeId) {
      qb.andWhere('rate.vehicleTypeId = :vehicleTypeId', {
        vehicleTypeId: query.vehicleTypeId,
      });
    }
    if (query.vehicleSizeId) {
      qb.andWhere('rate.vehicleSizeId = :vehicleSizeId', {
        vehicleSizeId: query.vehicleSizeId,
      });
    }
    if (query.vehicleCapacityId) {
      qb.andWhere('rate.vehicleCapacityId = :vehicleCapacityId', {
        vehicleCapacityId: query.vehicleCapacityId,
      });
    }
    if (query.pickupLocationId) {
      qb.andWhere('rate.pickupLocationId = :pickupLocationId', {
        pickupLocationId: query.pickupLocationId,
      });
    }
    if (query.dropoffLocationId) {
      qb.andWhere('rate.dropoffLocationId = :dropoffLocationId', {
        dropoffLocationId: query.dropoffLocationId,
      });
    }
    if (query.vendorProductId) {
      qb.andWhere('rate.vendorProductId = :vendorProductId', {
        vendorProductId: query.vendorProductId,
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
          client.companyName ILIKE :search
          OR vehicleType.name ILIKE :search
          OR vehicleSize.name ILIKE :search
          OR vehicleCapacity.name ILIKE :search
          OR pickupLocation.name ILIKE :search
          OR dropoffLocation.name ILIKE :search
          OR vendorProduct.name ILIKE :search
          OR CAST(rate.fuelRate AS text) ILIKE :search
          OR CAST(rate.freightRate AS text) ILIKE :search
          OR CAST(rate.fixedRate AS text) ILIKE :search
          OR CAST(rate.variableRate AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponse(row)),
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
    return this.toResponse(rate);
  }

  async findByClient(clientId: string) {
    await this.ensureClient(clientId);
    const rows = await this.rateRepo.find({
      where: { clientId },
      relations: {
        client: true,
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
        pickupLocation: true,
        dropoffLocation: true,
        vendorProduct: true,
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findLogs(id: string) {
    await this.findByIdOrFail(id);
    return this.getRecentLogs(id);
  }

  async update(
    id: string,
    dto: UpdateClientRateDto,
    activity?: ActivityActorContext,
  ) {
    const rate = await this.findByIdOrFail(id);
    const previousPricing = this.pickPricing(rate);
    const previousEffectiveFrom = rate.effectiveFromDate;

    if (dto.clientId !== undefined) {
      await this.ensureClient(dto.clientId);
      rate.clientId = dto.clientId;
    }
    if (dto.pickupLocationId !== undefined) {
      await this.ensurePickupLocation(rate.clientId, dto.pickupLocationId);
      rate.pickupLocationId = dto.pickupLocationId;
    }
    if (dto.dropoffLocationId !== undefined) {
      await this.ensureDropoffLocation(rate.clientId, dto.dropoffLocationId);
      rate.dropoffLocationId = dto.dropoffLocationId;
    }
    if (dto.vendorProductId !== undefined) {
      await this.ensureVendorProduct(dto.vendorProductId);
      rate.vendorProductId = dto.vendorProductId;
    }

    const mastersTouched =
      dto.vehicleTypeId !== undefined ||
      dto.vehicleSizeId !== undefined ||
      dto.vehicleCapacityId !== undefined;

    if (mastersTouched) {
      const nextTypeId = dto.vehicleTypeId ?? rate.vehicleTypeId;
      if (!nextTypeId) {
        throw new BadRequestException('vehicleTypeId is required');
      }

      const masters = await this.resolveMasters(
        nextTypeId,
        dto.vehicleSizeId !== undefined
          ? dto.vehicleSizeId
          : rate.vehicleSizeId,
        dto.vehicleCapacityId !== undefined
          ? dto.vehicleCapacityId
          : rate.vehicleCapacityId,
      );

      rate.vehicleTypeId = masters.vehicleTypeId;
      rate.vehicleSizeId = masters.vehicleSizeId;
      rate.vehicleCapacityId = masters.vehicleCapacityId;
    }

    if (
      dto.clientId !== undefined ||
      dto.pickupLocationId !== undefined ||
      dto.dropoffLocationId !== undefined ||
      dto.vendorProductId !== undefined ||
      mastersTouched
    ) {
      // Re-validate locations against (possibly new) client
      await this.ensurePickupLocation(rate.clientId, rate.pickupLocationId);
      await this.ensureDropoffLocation(rate.clientId, rate.dropoffLocationId);

      await this.ensureUniqueRate(
        rate.clientId,
        rate.vehicleTypeId,
        rate.vehicleSizeId ?? null,
        rate.vehicleCapacityId ?? null,
        rate.pickupLocationId,
        rate.dropoffLocationId,
        rate.vendorProductId,
        id,
      );
    }

    if (dto.effectiveFromDate !== undefined) {
      rate.effectiveFromDate = dto.effectiveFromDate
        ? (dto.effectiveFromDate.slice(0, 10) as unknown as Date)
        : null;
    }

    if (dto.fuelRate !== undefined) {
      rate.fuelRate = this.formatRate(dto.fuelRate);
    }
    if (dto.freightRate !== undefined) {
      rate.freightRate = this.formatRate(dto.freightRate);
    }
    if (dto.fixedRate !== undefined) {
      rate.fixedRate = this.formatRate(dto.fixedRate);
    }
    if (dto.variableRate !== undefined) {
      rate.variableRate = this.formatRate(dto.variableRate);
    }
    if (dto.fixedRatePercentage !== undefined) {
      rate.fixedRatePercentage = this.formatRate(dto.fixedRatePercentage);
    }
    if (dto.variableRatePercentage !== undefined) {
      rate.variableRatePercentage = this.formatRate(
        dto.variableRatePercentage,
      );
    }

    const pricingChanged = this.hasPricingChanged(
      previousPricing,
      this.pickPricing(rate),
    );

    await this.rateRepo.save(rate);

    if (pricingChanged) {
      await this.writeLog(
        id,
        previousPricing.freightRate,
        previousEffectiveFrom
          ? String(previousEffectiveFrom).slice(0, 10)
          : null,
        rate.effectiveFromDate
          ? String(rate.effectiveFromDate).slice(0, 10)
          : this.todayUtc(),
      );
    }

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.BILLING,
        entityType: 'ClientRate',
        entityId: id,
        record: this.rateRecordLabel(updated),
        description: `Updated client rate ${this.rateRecordLabel(updated)}`,
        metadata: {
          clientId: updated.clientId,
          vehicleTypeId: updated.vehicleTypeId,
          vehicleSizeId: updated.vehicleSizeId,
          vehicleCapacityId: updated.vehicleCapacityId,
          pickupLocationId: updated.pickupLocationId,
          dropoffLocationId: updated.dropoffLocationId,
          vendorProductId: updated.vendorProductId,
          fuelRate: updated.fuelRate,
          freightRate: updated.freightRate,
          fixedRate: updated.fixedRate,
          variableRate: updated.variableRate,
          fixedRatePercentage: updated.fixedRatePercentage,
          variableRatePercentage: updated.variableRatePercentage,
          previousPricing: pricingChanged ? previousPricing : undefined,
          effectiveFromDate: updated.effectiveFromDate,
        },
      },
      activity,
    );

    return updated;
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const rate = await this.findByIdOrFail(id);
    const label = this.rateRecordLabel(rate);

    await this.rateRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.BILLING,
        entityType: 'ClientRate',
        entityId: id,
        record: label,
        description: `Deleted client rate ${label}`,
        metadata: {
          clientId: rate.clientId,
          vehicleTypeId: rate.vehicleTypeId,
          vehicleSizeId: rate.vehicleSizeId,
          vehicleCapacityId: rate.vehicleCapacityId,
          pickupLocationId: rate.pickupLocationId,
          dropoffLocationId: rate.dropoffLocationId,
          vendorProductId: rate.vendorProductId,
        },
      },
      activity,
    );

    return { message: 'Client rate deleted' };
  }

  private async writeLog(
    clientRateId: string,
    previousPrice: string | null,
    effectiveFromDate?: string | null,
    effectiveToDate?: string | null,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        clientRateId,
        previousPrice,
        effectiveFromDate: effectiveFromDate as unknown as Date | null,
        effectiveToDate: effectiveToDate as unknown as Date | null,
      }),
    );
    await this.pruneOldLogs(clientRateId);
  }

  private async pruneOldLogs(clientRateId: string): Promise<void> {
    const keep = await this.logRepo.find({
      where: { clientRateId },
      order: { createdAt: 'DESC' },
      take: CLIENT_RATE_LOG_LIMIT,
      select: { id: true },
    });

    if (keep.length < CLIENT_RATE_LOG_LIMIT) {
      return;
    }

    const keepIds = keep.map((row) => row.id);
    await this.logRepo
      .createQueryBuilder()
      .delete()
      .from(ClientRateLog)
      .where('clientRateId = :clientRateId', { clientRateId })
      .andWhere('id NOT IN (:...keepIds)', { keepIds })
      .execute();
  }

  private async getRecentLogs(clientRateId: string): Promise<ClientRateLog[]> {
    return this.logRepo.find({
      where: { clientRateId },
      order: { createdAt: 'DESC' },
      take: CLIENT_RATE_LOG_LIMIT,
    });
  }

  private async findByIdOrFail(id: string): Promise<ClientRate> {
    const rate = await this.rateRepo.findOne({
      where: { id },
      relations: {
        client: true,
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
        pickupLocation: true,
        dropoffLocation: true,
        vendorProduct: true,
      },
    });
    if (!rate) {
      throw new NotFoundException('Client rate not found');
    }
    return rate;
  }

  private async ensureClient(clientId: string) {
    const exists = await this.clientRepo.exist({ where: { id: clientId } });
    if (!exists) {
      throw new NotFoundException('Client not found');
    }
  }

  private async applyClientRateUpdates(
    rate: ClientRate,
    dto: BulkUpdateClientRateItemDto,
  ): Promise<void> {
    if (dto.pickupLocationId !== undefined) {
      await this.ensurePickupLocation(rate.clientId, dto.pickupLocationId);
      rate.pickupLocationId = dto.pickupLocationId;
    }
    if (dto.dropoffLocationId !== undefined) {
      await this.ensureDropoffLocation(rate.clientId, dto.dropoffLocationId);
      rate.dropoffLocationId = dto.dropoffLocationId;
    }
    if (dto.vendorProductId !== undefined) {
      await this.ensureVendorProduct(dto.vendorProductId);
      rate.vendorProductId = dto.vendorProductId;
    }

    const mastersTouched =
      dto.vehicleTypeId !== undefined ||
      dto.vehicleSizeId !== undefined ||
      dto.vehicleCapacityId !== undefined;

    if (mastersTouched) {
      const nextTypeId = dto.vehicleTypeId ?? rate.vehicleTypeId;
      if (!nextTypeId) {
        throw new BadRequestException('vehicleTypeId is required');
      }

      const masters = await this.resolveMasters(
        nextTypeId,
        dto.vehicleSizeId !== undefined
          ? dto.vehicleSizeId
          : rate.vehicleSizeId,
        dto.vehicleCapacityId !== undefined
          ? dto.vehicleCapacityId
          : rate.vehicleCapacityId,
      );

      rate.vehicleTypeId = masters.vehicleTypeId;
      rate.vehicleSizeId = masters.vehicleSizeId;
      rate.vehicleCapacityId = masters.vehicleCapacityId;
    }

    if (
      dto.pickupLocationId !== undefined ||
      dto.dropoffLocationId !== undefined
    ) {
      await this.ensurePickupLocation(rate.clientId, rate.pickupLocationId);
      await this.ensureDropoffLocation(rate.clientId, rate.dropoffLocationId);
    }

    if (dto.effectiveFromDate !== undefined) {
      rate.effectiveFromDate = dto.effectiveFromDate
        ? (dto.effectiveFromDate.slice(0, 10) as unknown as Date)
        : null;
    }

    if (dto.fuelRate !== undefined) {
      rate.fuelRate = this.formatRate(dto.fuelRate);
    }
    if (dto.freightRate !== undefined) {
      rate.freightRate = this.formatRate(dto.freightRate);
    }
    if (dto.fixedRate !== undefined) {
      rate.fixedRate = this.formatRate(dto.fixedRate);
    }
    if (dto.variableRate !== undefined) {
      rate.variableRate = this.formatRate(dto.variableRate);
    }
    if (dto.fixedRatePercentage !== undefined) {
      rate.fixedRatePercentage = this.formatRate(dto.fixedRatePercentage);
    }
    if (dto.variableRatePercentage !== undefined) {
      rate.variableRatePercentage = this.formatRate(
        dto.variableRatePercentage,
      );
    }
  }

  private toPersistable(
    clientId: string,
    item: CreateClientRateItemDto,
    masters: {
      vehicleTypeId: string;
      vehicleSizeId: string | null;
      vehicleCapacityId: string | null;
    },
  ) {
    const effectiveFromDate = item.effectiveFromDate
      ? item.effectiveFromDate.slice(0, 10)
      : null;

    return {
      clientId,
      vehicleTypeId: masters.vehicleTypeId,
      vehicleSizeId: masters.vehicleSizeId,
      vehicleCapacityId: masters.vehicleCapacityId,
      pickupLocationId: item.pickupLocationId,
      dropoffLocationId: item.dropoffLocationId,
      vendorProductId: item.vendorProductId,
      fuelRate: this.formatRate(item.fuelRate),
      freightRate: this.formatRate(item.freightRate),
      fixedRate: this.formatRate(item.fixedRate),
      variableRate: this.formatRate(item.variableRate),
      fixedRatePercentage: this.formatRate(item.fixedRatePercentage),
      variableRatePercentage: this.formatRate(item.variableRatePercentage),
      effectiveFromDate: effectiveFromDate as unknown as Date | null,
    };
  }

  private uniqueRateKey(
    clientId: string,
    vehicleTypeId: string,
    vehicleSizeId: string | null,
    vehicleCapacityId: string | null,
    pickupLocationId: string,
    dropoffLocationId: string,
    vendorProductId: string,
  ): string {
    return [
      clientId,
      vehicleTypeId,
      vehicleSizeId ?? '',
      vehicleCapacityId ?? '',
      pickupLocationId,
      dropoffLocationId,
      vendorProductId,
    ].join('|');
  }

  private async prepareRateEntity(
    clientId: string,
    item: CreateClientRateItemDto,
    opts: {
      skipClientCheck?: boolean;
      skipDbUniqueCheck?: boolean;
    } = {},
  ) {
    if (!opts.skipClientCheck) {
      await this.ensureClient(clientId);
    }
    await this.ensurePickupLocation(clientId, item.pickupLocationId);
    await this.ensureDropoffLocation(clientId, item.dropoffLocationId);
    await this.ensureVendorProduct(item.vendorProductId);

    const masters = await this.resolveMasters(
      item.vehicleTypeId,
      item.vehicleSizeId,
      item.vehicleCapacityId,
    );

    if (!opts.skipDbUniqueCheck) {
      await this.ensureUniqueRate(
        clientId,
        masters.vehicleTypeId,
        masters.vehicleSizeId,
        masters.vehicleCapacityId,
        item.pickupLocationId,
        item.dropoffLocationId,
        item.vendorProductId,
      );
    }

    return this.toPersistable(clientId, item, masters);
  }

  private async ensurePickupLocation(clientId: string, pickupLocationId: string) {
    const location = await this.pickupRepo.findOne({
      where: { id: pickupLocationId, clientId },
    });
    if (!location) {
      throw new NotFoundException(
        'Pickup location not found for this client',
      );
    }
  }

  private async ensureDropoffLocation(
    clientId: string,
    dropoffLocationId: string,
  ) {
    const location = await this.dropoffRepo.findOne({
      where: { id: dropoffLocationId, clientId },
    });
    if (!location) {
      throw new NotFoundException(
        'Dropoff location not found for this client',
      );
    }
  }

  private async ensureVendorProduct(vendorProductId: string) {
    const product = await this.vendorProductRepo.findOne({
      where: { id: vendorProductId },
    });
    if (!product) {
      throw new NotFoundException('Vendor product not found');
    }
  }

  private async resolveMasters(
    vehicleTypeId: string,
    vehicleSizeId?: string | null,
    vehicleCapacityId?: string | null,
  ): Promise<{
    vehicleTypeId: string;
    vehicleSizeId: string | null;
    vehicleCapacityId: string | null;
  }> {
    const type = await this.typeRepo.findOne({
      where: { id: vehicleTypeId, isActive: true },
    });
    if (!type) {
      throw new NotFoundException('Vehicle type not found or inactive');
    }

    let sizeId: string | null = null;
    let capacityId: string | null = null;

    if (type.measurement === VehicleTypeMeasurement.SIZE) {
      if (!vehicleSizeId) {
        throw new BadRequestException(
          'vehicleSizeId is required when type measurement is SIZE',
        );
      }
      const size = await this.sizeRepo.findOne({
        where: { id: vehicleSizeId, isActive: true },
      });
      if (!size) {
        throw new NotFoundException('Vehicle size not found or inactive');
      }
      sizeId = size.id;
      capacityId = null;
    } else {
      if (!vehicleCapacityId) {
        throw new BadRequestException(
          'vehicleCapacityId is required when type measurement is CAPACITY',
        );
      }
      const capacity = await this.capacityRepo.findOne({
        where: { id: vehicleCapacityId, isActive: true },
      });
      if (!capacity) {
        throw new NotFoundException('Vehicle capacity not found or inactive');
      }
      capacityId = capacity.id;
      sizeId = null;
    }

    return {
      vehicleTypeId: type.id,
      vehicleSizeId: sizeId,
      vehicleCapacityId: capacityId,
    };
  }

  private async ensureUniqueRate(
    clientId: string,
    vehicleTypeId: string,
    vehicleSizeId: string | null,
    vehicleCapacityId: string | null,
    pickupLocationId: string,
    dropoffLocationId: string,
    vendorProductId: string,
    excludeId?: string,
  ) {
    const existing = await this.rateRepo.findOne({
      where: {
        clientId,
        vehicleTypeId,
        vehicleSizeId: vehicleSizeId ?? IsNull(),
        vehicleCapacityId: vehicleCapacityId ?? IsNull(),
        pickupLocationId,
        dropoffLocationId,
        vendorProductId,
      },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'A rate already exists for this client, vehicle type/size/capacity, pickup/dropoff, and vendor product',
      );
    }
  }

  private pickPricing(rate: ClientRate): ClientRatePricing {
    return {
      fuelRate: rate.fuelRate,
      freightRate: rate.freightRate,
      fixedRate: rate.fixedRate,
      variableRate: rate.variableRate,
      fixedRatePercentage: rate.fixedRatePercentage,
      variableRatePercentage: rate.variableRatePercentage,
    };
  }

  private hasPricingChanged(
    previous: ClientRatePricing,
    next: ClientRatePricing,
  ): boolean {
    return (
      previous.fuelRate !== next.fuelRate ||
      previous.freightRate !== next.freightRate ||
      previous.fixedRate !== next.fixedRate ||
      previous.variableRate !== next.variableRate ||
      previous.fixedRatePercentage !== next.fixedRatePercentage ||
      previous.variableRatePercentage !== next.variableRatePercentage
    );
  }

  private formatRate(rate: number): string {
    return rate.toFixed(2);
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private rateRecordLabel(
    rate: Pick<ClientRate, 'id' | 'freightRate' | 'vendorProductId'> & {
      client?: Pick<Client, 'companyName'> | null;
      vehicleType?: Pick<VehicleType, 'name'> | null;
      vehicleSize?: Pick<VehicleSize, 'name'> | null;
      vehicleCapacity?: Pick<VehicleCapacity, 'name'> | null;
      pickupLocation?: Pick<ClientPickupLocation, 'name'> | null;
      dropoffLocation?: Pick<ClientDropoffLocation, 'name'> | null;
      vendorProduct?: Pick<VendorProduct, 'name'> | null;
    },
  ): string {
    const route =
      rate.pickupLocation?.name || rate.dropoffLocation?.name
        ? [rate.pickupLocation?.name, rate.dropoffLocation?.name]
            .filter(Boolean)
            .join(' → ')
        : null;
    const parts = [
      rate.client?.companyName,
      rate.vehicleType?.name,
      rate.vehicleSize?.name || rate.vehicleCapacity?.name,
      route,
      rate.vendorProduct?.name,
      rate.freightRate != null ? `$${rate.freightRate}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : rate.id;
  }

  private toResponse(rate: ClientRate) {
    return {
      id: rate.id,
      clientId: rate.clientId,
      vehicleTypeId: rate.vehicleTypeId,
      vehicleSizeId: rate.vehicleSizeId ?? null,
      vehicleCapacityId: rate.vehicleCapacityId ?? null,
      pickupLocationId: rate.pickupLocationId,
      dropoffLocationId: rate.dropoffLocationId,
      vendorProductId: rate.vendorProductId,
      fuelRate: rate.fuelRate,
      freightRate: rate.freightRate,
      fixedRate: rate.fixedRate,
      variableRate: rate.variableRate,
      fixedRatePercentage: rate.fixedRatePercentage,
      variableRatePercentage: rate.variableRatePercentage,
      effectiveFromDate: rate.effectiveFromDate ?? null,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
      client: rate.client
        ? {
            id: rate.client.id,
            companyName: rate.client.companyName,
            email: rate.client.email ?? null,
          }
        : null,
      vehicleType: rate.vehicleType
        ? {
            id: rate.vehicleType.id,
            name: rate.vehicleType.name,
            slug: rate.vehicleType.slug,
            measurement: rate.vehicleType.measurement,
          }
        : null,
      vehicleSize: rate.vehicleSize
        ? {
            id: rate.vehicleSize.id,
            name: rate.vehicleSize.name,
            slug: rate.vehicleSize.slug,
          }
        : null,
      vehicleCapacity: rate.vehicleCapacity
        ? {
            id: rate.vehicleCapacity.id,
            name: rate.vehicleCapacity.name,
            slug: rate.vehicleCapacity.slug,
          }
        : null,
      pickupLocation: rate.pickupLocation
        ? {
            id: rate.pickupLocation.id,
            name: rate.pickupLocation.name,
            address: rate.pickupLocation.address,
          }
        : null,
      dropoffLocation: rate.dropoffLocation
        ? {
            id: rate.dropoffLocation.id,
            name: rate.dropoffLocation.name,
            address: rate.dropoffLocation.address,
          }
        : null,
      vendorProduct: rate.vendorProduct
        ? {
            id: rate.vendorProduct.id,
            name: rate.vendorProduct.name,
          }
        : null,
    };
  }
}
