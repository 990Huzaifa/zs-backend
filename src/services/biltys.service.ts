import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BiltyListQueryDto,
  ChangeBiltyStatusDto,
  CreateBiltyDto,
  CreateBiltyLoadingDto,
  CreateBiltyOffLoadingDto,
  UpdateBiltyDto,
} from '../auth/dto/bilty.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  BILTY_CODE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Bilty,
  BiltyLoading,
  BiltyOffLoading,
  BiltyStatus,
} from '../database/entities/bilty.entity';
import {
  Client,
  ClientDropoffLocation,
  ClientPickupLocation,
} from '../database/entities/client.entity';
import { Driver } from '../database/entities/driver.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class BiltysService {
  constructor(
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientPickupLocation)
    private readonly pickupRepo: Repository<ClientPickupLocation>,
    @InjectRepository(ClientDropoffLocation)
    private readonly dropoffRepo: Repository<ClientDropoffLocation>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateBiltyDto,
    createdById: string,
    activity?: ActivityActorContext,
  ) {
    await this.ensureDriver(dto.driverId);
    await this.ensureVehicle(dto.vehicleId);

    const loadings = dto.loadings ?? [];
    const offLoadings = dto.offLoadings ?? [];
    await this.validateLoadings(loadings);
    await this.validateOffLoadings(offLoadings);

    const code = await this.generateUniqueCode();

    const savedId = await this.dataSource.transaction(async (manager) => {
      const bilty = await manager.save(
        manager.create(Bilty, {
          code,
          issueDate: dto.issueDate.slice(0, 10) as unknown as Date,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          description: dto.description.trim(),
          refNumber: this.nullableTrim(dto.refNumber),
          totalWeight: this.nullableTrim(dto.totalWeight),
          noOfPackages: this.nullableTrim(dto.noOfPackages),
          transaportorName: this.nullableTrim(dto.transaportorName),
          transaportorPhone: this.nullableTrim(dto.transaportorPhone),
          createdById,
          status: dto.status ?? BiltyStatus.PENDING,
        }),
      );

      await this.replaceLoadings(manager, bilty.id, loadings);
      await this.replaceOffLoadings(manager, bilty.id, offLoadings);

      return bilty.id;
    });

    const result = await this.findOne(savedId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: savedId,
        record: code,
        description: `Created bilty ${code}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query: BiltyListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.biltyRepo
      .createQueryBuilder('bilty')
      .leftJoinAndSelect('bilty.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .leftJoinAndSelect('bilty.vehicle', 'vehicle')
      .leftJoinAndSelect('bilty.createdBy', 'createdBy')
      .orderBy('bilty.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('bilty.status = :status', { status: query.status });
    }
    if (query.driverId) {
      qb.andWhere('bilty.driverId = :driverId', { driverId: query.driverId });
    }
    if (query.vehicleId) {
      qb.andWhere('bilty.vehicleId = :vehicleId', {
        vehicleId: query.vehicleId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          bilty.code ILIKE :search
          OR bilty.description ILIKE :search
          OR bilty.refNumber ILIKE :search
          OR bilty.transaportorName ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR driverUser.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

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
    return this.findByIdOrFail(id);
  }

  async update(
    id: string,
    dto: UpdateBiltyDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.findByIdOrFail(id);

    if (dto.driverId !== undefined) {
      await this.ensureDriver(dto.driverId);
      bilty.driverId = dto.driverId;
    }
    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      bilty.vehicleId = dto.vehicleId;
    }
    if (dto.issueDate !== undefined) {
      bilty.issueDate = dto.issueDate.slice(0, 10) as unknown as Date;
    }
    if (dto.description !== undefined) {
      bilty.description = dto.description.trim();
    }
    if (dto.refNumber !== undefined) {
      bilty.refNumber = this.nullableTrim(dto.refNumber);
    }
    if (dto.totalWeight !== undefined) {
      bilty.totalWeight = this.nullableTrim(dto.totalWeight);
    }
    if (dto.noOfPackages !== undefined) {
      bilty.noOfPackages = this.nullableTrim(dto.noOfPackages);
    }
    if (dto.transaportorName !== undefined) {
      bilty.transaportorName = this.nullableTrim(dto.transaportorName);
    }
    if (dto.transaportorPhone !== undefined) {
      bilty.transaportorPhone = this.nullableTrim(dto.transaportorPhone);
    }

    if (dto.loadings !== undefined) {
      await this.validateLoadings(dto.loadings);
    }
    if (dto.offLoadings !== undefined) {
      await this.validateOffLoadings(dto.offLoadings);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(bilty);
      if (dto.loadings !== undefined) {
        await this.replaceLoadings(manager, id, dto.loadings);
      }
      if (dto.offLoadings !== undefined) {
        await this.replaceOffLoadings(manager, id, dto.offLoadings);
      }
    });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: id,
        record: result.code,
        description: `Updated bilty ${result.code}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeBiltyStatusDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.findByIdOrFail(id);
    bilty.status = dto.status;
    await this.biltyRepo.save(bilty);

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: id,
        record: result.code,
        description: `Changed bilty ${result.code} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );
    return result;
  }

  private async findByIdOrFail(id: string) {
    const bilty = await this.biltyRepo.findOne({
      where: { id },
      relations: {
        driver: { user: true },
        vehicle: true,
        createdBy: true,
        loadings: {
          client: true,
          pickupLocation: true,
        },
        offLoadings: {
          client: true,
          dropoffLocation: true,
        },
      },
      order: {
        loadings: { createdAt: 'ASC' },
        offLoadings: { createdAt: 'ASC' },
      },
    });
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return bilty;
  }

  private async ensureDriver(driverId: string) {
    const exists = await this.driverRepo.exist({ where: { id: driverId } });
    if (!exists) {
      throw new BadRequestException('Driver not found');
    }
  }

  private async ensureVehicle(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) {
      throw new BadRequestException('Vehicle not found');
    }
  }

  private async validateLoadings(loadings: CreateBiltyLoadingDto[]) {
    for (const item of loadings) {
      const client = await this.clientRepo.exist({
        where: { id: item.clientId },
      });
      if (!client) {
        throw new BadRequestException(
          `Client not found: ${item.clientId}`,
        );
      }

      const pickup = await this.pickupRepo.findOne({
        where: { id: item.pickupLocationId },
      });
      if (!pickup) {
        throw new BadRequestException(
          `Pickup location not found: ${item.pickupLocationId}`,
        );
      }
      if (pickup.clientId !== item.clientId) {
        throw new BadRequestException(
          'Pickup location does not belong to the selected client',
        );
      }
    }
  }

  private async validateOffLoadings(offLoadings: CreateBiltyOffLoadingDto[]) {
    for (const item of offLoadings) {
      const client = await this.clientRepo.exist({
        where: { id: item.clientId },
      });
      if (!client) {
        throw new BadRequestException(
          `Client not found: ${item.clientId}`,
        );
      }

      const dropoff = await this.dropoffRepo.findOne({
        where: { id: item.dropoffLocationId },
      });
      if (!dropoff) {
        throw new BadRequestException(
          `Dropoff location not found: ${item.dropoffLocationId}`,
        );
      }
      if (dropoff.clientId !== item.clientId) {
        throw new BadRequestException(
          'Dropoff location does not belong to the selected client',
        );
      }
    }
  }

  private async replaceLoadings(
    manager: EntityManager,
    biltyId: string,
    loadings: CreateBiltyLoadingDto[],
  ) {
    await manager.delete(BiltyLoading, { biltyId });
    if (!loadings.length) return;

    await manager.save(
      loadings.map((item) =>
        manager.create(BiltyLoading, {
          biltyId,
          clientId: item.clientId,
          loadingDate: item.loadingDate.slice(0, 10) as unknown as Date,
          arrivalDate: this.toOptionalDate(item.arrivalDate),
          loadingTimeIn: this.toOptionalDate(item.loadingTimeIn),
          loadingTimeOut: this.toOptionalDate(item.loadingTimeOut),
          pickupLocationId: item.pickupLocationId,
          loadingContactName: this.nullableTrim(item.loadingContactName),
          loadingContactPhone: this.nullableTrim(item.loadingContactPhone),
          noOfLoadingStops: this.nullableInt(item.noOfLoadingStops),
        }),
      ),
    );
  }

  private async replaceOffLoadings(
    manager: EntityManager,
    biltyId: string,
    offLoadings: CreateBiltyOffLoadingDto[],
  ) {
    await manager.delete(BiltyOffLoading, { biltyId });
    if (!offLoadings.length) return;

    await manager.save(
      offLoadings.map((item) =>
        manager.create(BiltyOffLoading, {
          biltyId,
          clientId: item.clientId,
          offLoadingDate: item.offLoadingDate.slice(0, 10) as unknown as Date,
          offLoadingTimeIn: this.toOptionalDate(item.offLoadingTimeIn),
          offLoadingTimeOut: this.toOptionalDate(item.offLoadingTimeOut),
          dropoffLocationId: item.dropoffLocationId,
          offLoadingContactName: this.nullableTrim(
            item.offLoadingContactName,
          ),
          offLoadingContactPhone: this.nullableTrim(
            item.offLoadingContactPhone,
          ),
          noOfOffLoadingStops: this.nullableInt(item.noOfOffLoadingStops),
        }),
      ),
    );
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.biltyRepo,
        BILTY_CODE_PREFIX,
        'code',
        6,
        attempt,
      );
      const existing = await this.biltyRepo.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    throw new BadRequestException('Could not generate unique bilty code');
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private nullableInt(value?: number | null): number | null {
    if (value === undefined || value === null) return null;
    return value;
  }

  private toOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return new Date(value);
  }
}
