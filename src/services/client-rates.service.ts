import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ClientRateListQueryDto,
  CreateClientRateDto,
  UpdateClientRateDto,
} from '../auth/dto/client-rate.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { City } from '../database/entities/city.entity';
import {
  Client,
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
import { ActivitiesService } from './activities.service';

/** Rolling price history retained per client rate. */
const CLIENT_RATE_LOG_LIMIT = 10;

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
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Trip create — ACTIVE clients that have rates matching this vehicle's
   * type + size/capacity (and optional city).
   */
  async listClientsUtilityForVehicle(
    vehicleId: string,
    opts: { cityId?: number; search?: string } = {},
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

    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .innerJoinAndSelect('rate.client', 'client')
      .leftJoinAndSelect('rate.city', 'city')
      .leftJoinAndSelect('rate.vehicleType', 'vehicleType')
      .leftJoinAndSelect('rate.vehicleSize', 'vehicleSize')
      .leftJoinAndSelect('rate.vehicleCapacity', 'vehicleCapacity')
      .where('rate.vehicleTypeId = :vehicleTypeId', {
        vehicleTypeId: vehicle.vehicleTypeId,
      })
      .andWhere('client.status = :clientStatus', {
        clientStatus: ClientStatus.ACTIVE,
      })
      .orderBy('client.companyName', 'ASC')
      .addOrderBy('rate.price', 'ASC');

    if (vehicle.vehicleSizeId) {
      qb.andWhere('rate.vehicleSizeId = :vehicleSizeId', {
        vehicleSizeId: vehicle.vehicleSizeId,
      });
    } else {
      qb.andWhere('rate.vehicleSizeId IS NULL');
    }

    if (vehicle.vehicleCapacityId) {
      qb.andWhere('rate.vehicleCapacityId = :vehicleCapacityId', {
        vehicleCapacityId: vehicle.vehicleCapacityId,
      });
    } else {
      qb.andWhere('rate.vehicleCapacityId IS NULL');
    }

    if (opts.cityId !== undefined) {
      qb.andWhere('rate.cityId = :cityId', { cityId: opts.cityId });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          client.companyName ILIKE :search
          OR client.email ILIKE :search
          OR city.name ILIKE :search
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
        email: string;
        companyAddress: string;
        rates: Array<{
          id: string;
          cityId: number;
          price: string;
          effectiveFromDate: Date | null;
          city: { id: number; name: string; code: string } | null;
        }>;
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
          email: rate.client.email,
          companyAddress: rate.client.companyAddress,
          rates: [],
        };
        byClient.set(rate.clientId, entry);
      }
      entry.rates.push({
        id: rate.id,
        cityId: rate.cityId,
        price: rate.price,
        effectiveFromDate: rate.effectiveFromDate ?? null,
        city: rate.city
          ? {
              id: rate.city.id,
              name: rate.city.name,
              code: rate.city.code,
            }
          : null,
      });
    }

    return {
      data: [...byClient.values()],
      vehicle: this.toVehicleUtilityMeta(vehicle),
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

  async create(dto: CreateClientRateDto, activity?: ActivityActorContext) {
    await this.ensureClient(dto.clientId);
    await this.ensureCity(dto.cityId);

    const masters = await this.resolveMasters(
      dto.vehicleTypeId,
      dto.vehicleSizeId,
      dto.vehicleCapacityId,
    );

    await this.ensureUniqueRate(
      dto.clientId,
      masters.vehicleTypeId,
      masters.vehicleSizeId,
      masters.vehicleCapacityId,
      dto.cityId,
    );

    const effectiveFromDate = dto.effectiveFromDate
      ? dto.effectiveFromDate.slice(0, 10)
      : null;

    const saved = await this.rateRepo.save(
      this.rateRepo.create({
        clientId: dto.clientId,
        vehicleTypeId: masters.vehicleTypeId,
        vehicleSizeId: masters.vehicleSizeId,
        vehicleCapacityId: masters.vehicleCapacityId,
        cityId: dto.cityId,
        price: this.formatPrice(dto.price),
        effectiveFromDate: effectiveFromDate as unknown as Date | null,
      }),
    );

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
          cityId: rate.cityId,
          price: rate.price,
          effectiveFromDate: rate.effectiveFromDate,
        },
      },
      activity,
    );

    return rate;
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
      .leftJoinAndSelect('rate.city', 'city')
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
    if (query.cityId !== undefined) {
      qb.andWhere('rate.cityId = :cityId', { cityId: query.cityId });
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
          OR city.name ILIKE :search
          OR CAST(rate.price AS text) ILIKE :search
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
        city: true,
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
    const previousPrice = rate.price;
    const previousEffectiveFrom = rate.effectiveFromDate;

    if (dto.clientId !== undefined) {
      await this.ensureClient(dto.clientId);
      rate.clientId = dto.clientId;
    }
    if (dto.cityId !== undefined) {
      await this.ensureCity(dto.cityId);
      rate.cityId = dto.cityId;
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
      dto.cityId !== undefined ||
      mastersTouched
    ) {
      await this.ensureUniqueRate(
        rate.clientId,
        rate.vehicleTypeId,
        rate.vehicleSizeId ?? null,
        rate.vehicleCapacityId ?? null,
        rate.cityId,
        id,
      );
    }

    if (dto.effectiveFromDate !== undefined) {
      rate.effectiveFromDate = dto.effectiveFromDate
        ? (dto.effectiveFromDate.slice(0, 10) as unknown as Date)
        : null;
    }

    let priceChanged = false;
    if (dto.price !== undefined) {
      const nextPrice = this.formatPrice(dto.price);
      if (nextPrice !== previousPrice) {
        priceChanged = true;
        rate.price = nextPrice;
      }
    }

    await this.rateRepo.save(rate);

    if (priceChanged) {
      await this.writeLog(
        id,
        previousPrice,
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
          cityId: updated.cityId,
          price: updated.price,
          previousPrice: priceChanged ? previousPrice : undefined,
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
          cityId: rate.cityId,
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
        city: true,
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

  private async ensureCity(cityId: number) {
    const city = await this.cityRepo.findOne({
      where: { id: cityId as unknown as string },
    });
    if (!city) {
      throw new NotFoundException('City not found');
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
    cityId: number,
    excludeId?: string,
  ) {
    const existing = await this.rateRepo.findOne({
      where: {
        clientId,
        vehicleTypeId,
        vehicleSizeId: vehicleSizeId ?? IsNull(),
        vehicleCapacityId: vehicleCapacityId ?? IsNull(),
        cityId,
      },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'A rate already exists for this client, vehicle type/size/capacity, and city',
      );
    }
  }

  private formatPrice(price: number): string {
    return price.toFixed(2);
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private rateRecordLabel(
    rate: Pick<ClientRate, 'id' | 'price'> & {
      client?: Pick<Client, 'companyName'> | null;
      vehicleType?: Pick<VehicleType, 'name'> | null;
      vehicleSize?: Pick<VehicleSize, 'name'> | null;
      vehicleCapacity?: Pick<VehicleCapacity, 'name'> | null;
      city?: Pick<City, 'name'> | null;
    },
  ): string {
    const parts = [
      rate.client?.companyName,
      rate.vehicleType?.name,
      rate.vehicleSize?.name || rate.vehicleCapacity?.name,
      rate.city?.name,
      rate.price != null ? `$${rate.price}` : null,
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
      cityId: rate.cityId,
      price: rate.price,
      effectiveFromDate: rate.effectiveFromDate ?? null,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
      client: rate.client
        ? {
            id: rate.client.id,
            companyName: rate.client.companyName,
            email: rate.client.email,
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
      city: rate.city
        ? {
            id: rate.city.id,
            name: rate.city.name,
            code: rate.city.code,
          }
        : null,
    };
  }
}
