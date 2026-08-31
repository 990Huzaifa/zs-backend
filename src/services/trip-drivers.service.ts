import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateTripDriverDto,
  ReplaceTripDriversDto,
  TripDriverListQueryDto,
} from '../auth/dto/trip-driver.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Driver } from '../database/entities/driver.entity';
import { Trip, TripDriver } from '../database/entities/trip.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class TripDriversService {
  constructor(
    @InjectRepository(TripDriver)
    private readonly tripDriverRepo: Repository<TripDriver>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    tripId: string,
    dto: CreateTripDriverDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.ensureTrip(tripId);
    await this.ensureDriver(dto.driverId);

    const existing = await this.tripDriverRepo.findOne({
      where: { tripId, driverId: dto.driverId },
    });
    if (existing) {
      throw new ConflictException('Driver is already assigned to this trip');
    }

    const saved = await this.tripDriverRepo.save(
      this.tripDriverRepo.create({
        tripId,
        driverId: dto.driverId,
      }),
    );

    const row = await this.findOne(tripId, saved.id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripDriver',
        entityId: saved.id,
        record: trip.tripCode,
        description: `Added driver to trip ${trip.tripCode}`,
        metadata: { tripId, driverId: dto.driverId },
      },
      activity,
    );
    return row;
  }

  async findByTrip(tripId: string, query: TripDriverListQueryDto = {}) {
    await this.ensureTrip(tripId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const [rows, total] = await this.tripDriverRepo.findAndCount({
      where: { tripId },
      relations: { driver: { user: true }, trip: true },
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });

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

  async findOne(tripId: string, id: string) {
    const row = await this.tripDriverRepo.findOne({
      where: { id, tripId },
      relations: { driver: { user: true }, trip: true },
    });
    if (!row) {
      throw new NotFoundException('Trip driver not found');
    }
    return this.toResponse(row);
  }

  async replace(
    tripId: string,
    dto: ReplaceTripDriversDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.ensureTrip(tripId);
    await this.ensureDrivers(dto.driverIds);

    await this.tripDriverRepo.manager.transaction(async (manager) => {
      await this.replaceDrivers(manager, tripId, dto.driverIds);
    });

    const result = await this.findByTrip(tripId, { page: 1, limit: 100 });
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripDriver',
        entityId: tripId,
        record: trip.tripCode,
        description: `Replaced drivers on trip ${trip.tripCode}`,
        metadata: { tripId, driverIds: dto.driverIds },
      },
      activity,
    );
    return result;
  }

  async remove(
    tripId: string,
    id: string,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.ensureTrip(tripId);
    const row = await this.tripDriverRepo.findOne({ where: { id, tripId } });
    if (!row) {
      throw new NotFoundException('Trip driver not found');
    }

    const remaining = await this.tripDriverRepo.count({ where: { tripId } });
    if (remaining <= 1) {
      throw new BadRequestException(
        'Trip must keep at least one driver. Replace drivers instead of removing the last one.',
      );
    }

    await this.tripDriverRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'TripDriver',
        entityId: id,
        record: trip.tripCode,
        description: `Removed driver from trip ${trip.tripCode}`,
        metadata: { tripId, driverId: row.driverId },
      },
      activity,
    );

    return { message: 'Trip driver removed' };
  }

  /** Used by TripsService create/update inside an open transaction. */
  async replaceDrivers(
    manager: EntityManager,
    tripId: string,
    driverIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(driverIds)];
    if (!uniqueIds.length) {
      throw new BadRequestException('At least one driver is required');
    }

    await manager.delete(TripDriver, { tripId });
    await manager.save(
      uniqueIds.map((driverId) =>
        manager.create(TripDriver, { tripId, driverId }),
      ),
    );
  }

  async ensureDrivers(driverIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(driverIds)];
    if (!uniqueIds.length) {
      throw new BadRequestException('At least one driver is required');
    }
    for (const driverId of uniqueIds) {
      await this.ensureDriver(driverId);
    }
  }

  private async ensureTrip(tripId: string): Promise<Trip> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  private async ensureDriver(driverId: string) {
    const exists = await this.driverRepo.exist({ where: { id: driverId } });
    if (!exists) {
      throw new BadRequestException('Driver not found');
    }
  }

  private toResponse(row: TripDriver) {
    return {
      id: row.id,
      tripId: row.tripId,
      driverId: row.driverId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      trip: row.trip
        ? {
            id: row.trip.id,
            tripCode: row.trip.tripCode,
            status: row.trip.status,
          }
        : null,
      driver: row.driver
        ? {
            id: row.driver.id,
            driverType: row.driver.driverType,
            phone: row.driver.phone ?? null,
            licenseNo: row.driver.licenseNo ?? null,
            user: row.driver.user
              ? {
                  id: row.driver.user.id,
                  name: row.driver.user.name,
                  phone: row.driver.user.phone ?? null,
                }
              : null,
          }
        : null,
    };
  }
}
