import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from '../database/entities/client.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
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
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateClientRateDto, activity?: ActivityActorContext) {
    await this.ensureClient(dto.clientId);
    await this.ensureVehicle(dto.vehicleId);
    await this.ensureCity(dto.cityId);

    const existing = await this.rateRepo.findOne({
      where: {
        clientId: dto.clientId,
        vehicleId: dto.vehicleId,
        cityId: dto.cityId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'A rate already exists for this client, vehicle, and city',
      );
    }

    const effectiveFromDate = dto.effectiveFromDate
      ? dto.effectiveFromDate.slice(0, 10)
      : null;

    const saved = await this.rateRepo.save(
      this.rateRepo.create({
        clientId: dto.clientId,
        vehicleId: dto.vehicleId,
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
          vehicleId: rate.vehicleId,
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
      .leftJoinAndSelect('rate.vehicle', 'vehicle')
      .leftJoinAndSelect('rate.city', 'city')
      .orderBy('rate.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.clientId) {
      qb.andWhere('rate.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.vehicleId) {
      qb.andWhere('rate.vehicleId = :vehicleId', {
        vehicleId: query.vehicleId,
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
          OR vehicle.regNo ILIKE :search
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
      relations: { client: true, vehicle: true, city: true },
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
    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      rate.vehicleId = dto.vehicleId;
    }
    if (dto.cityId !== undefined) {
      await this.ensureCity(dto.cityId);
      rate.cityId = dto.cityId;
    }

    const nextClientId = rate.clientId;
    const nextVehicleId = rate.vehicleId;
    const nextCityId = rate.cityId;
    if (
      dto.clientId !== undefined ||
      dto.vehicleId !== undefined ||
      dto.cityId !== undefined
    ) {
      const conflict = await this.rateRepo.findOne({
        where: {
          clientId: nextClientId,
          vehicleId: nextVehicleId,
          cityId: nextCityId,
        },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          'A rate already exists for this client, vehicle, and city',
        );
      }
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
          vehicleId: updated.vehicleId,
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
          vehicleId: rate.vehicleId,
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
        vehicle: true,
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

  private async ensureVehicle(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) {
      throw new NotFoundException('Vehicle not found');
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

  private formatPrice(price: number): string {
    return price.toFixed(2);
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private rateRecordLabel(
    rate: Pick<ClientRate, 'id' | 'price'> & {
      client?: Pick<Client, 'companyName'> | null;
      vehicle?: Pick<Vehicle, 'regNo'> | null;
      city?: Pick<City, 'name'> | null;
    },
  ): string {
    const parts = [
      rate.client?.companyName,
      rate.vehicle?.regNo,
      rate.city?.name,
      rate.price != null ? `$${rate.price}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : rate.id;
  }

  private toResponse(rate: ClientRate) {
    return {
      id: rate.id,
      clientId: rate.clientId,
      vehicleId: rate.vehicleId,
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
      vehicle: rate.vehicle
        ? {
            id: rate.vehicle.id,
            regNo: rate.vehicle.regNo,
            ownership: rate.vehicle.ownership,
            status: rate.vehicle.status,
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
