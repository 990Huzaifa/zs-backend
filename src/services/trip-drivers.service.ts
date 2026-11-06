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
  TripDriverInputDto,
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

type ResolvedTripDriver = {
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
};

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
    const resolved = await this.resolveDriverEntry(dto);

    if (resolved.driverId) {
      const existing = await this.tripDriverRepo.findOne({
        where: { tripId, driverId: resolved.driverId },
      });
      if (existing) {
        throw new ConflictException('Driver is already assigned to this trip');
      }
    }

    const saved = await this.tripDriverRepo.save(
      this.tripDriverRepo.create({
        tripId,
        driverId: resolved.driverId,
        driverName: resolved.driverName,
        driverPhone: resolved.driverPhone,
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
        metadata: {
          tripId,
          driverId: resolved.driverId,
          driverName: resolved.driverName,
        },
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
    const entries = await this.normalizeDriverInputs(dto);

    await this.tripDriverRepo.manager.transaction(async (manager) => {
      await this.replaceDrivers(manager, tripId, entries);
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
        metadata: {
          tripId,
          driverIds: entries.map((e) => e.driverId).filter(Boolean),
          drivers: entries,
        },
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
        metadata: {
          tripId,
          driverId: row.driverId,
          driverName: row.driverName,
        },
      },
      activity,
    );

    return { message: 'Trip driver removed' };
  }

  /** Used by TripsService create/update inside an open transaction. */
  async replaceDrivers(
    manager: EntityManager,
    tripId: string,
    drivers: Array<string | TripDriverInputDto | ResolvedTripDriver>,
  ): Promise<void> {
    const entries = await this.resolveDriverEntries(drivers);
    if (!entries.length) {
      throw new BadRequestException('At least one driver is required');
    }

    await manager.delete(TripDriver, { tripId });
    await manager.save(
      entries.map((entry) =>
        manager.create(TripDriver, {
          tripId,
          driverId: entry.driverId,
          driverName: entry.driverName,
          driverPhone: entry.driverPhone,
        }),
      ),
    );
  }

  /** Validate create/update DTO inputs (legacy driverIds and/or drivers[]). */
  async ensureDrivers(
    drivers: Array<string | TripDriverInputDto> | ReplaceTripDriversDto,
  ): Promise<ResolvedTripDriver[]> {
    if (Array.isArray(drivers)) {
      return this.resolveDriverEntries(drivers);
    }
    return this.normalizeDriverInputs(drivers);
  }

  private async normalizeDriverInputs(
    dto: ReplaceTripDriversDto | { driverIds?: string[]; drivers?: TripDriverInputDto[] },
  ): Promise<ResolvedTripDriver[]> {
    if (dto.drivers?.length) {
      return this.resolveDriverEntries(dto.drivers);
    }
    if (dto.driverIds?.length) {
      return this.resolveDriverEntries(dto.driverIds);
    }
    throw new BadRequestException(
      'Either drivers or driverIds is required (at least one entry)',
    );
  }

  private async resolveDriverEntries(
    drivers: Array<string | TripDriverInputDto | ResolvedTripDriver>,
  ): Promise<ResolvedTripDriver[]> {
    if (!drivers.length) {
      throw new BadRequestException('At least one driver is required');
    }

    const resolved: ResolvedTripDriver[] = [];
    const seenSystemIds = new Set<string>();

    for (const item of drivers) {
      const entry =
        typeof item === 'string'
          ? await this.resolveDriverEntry({ driverId: item })
          : await this.resolveDriverEntry(item);

      if (entry.driverId) {
        if (seenSystemIds.has(entry.driverId)) {
          throw new BadRequestException(
            `Duplicate driverId in trip drivers: ${entry.driverId}`,
          );
        }
        seenSystemIds.add(entry.driverId);
      }
      resolved.push(entry);
    }

    return resolved;
  }

  private async resolveDriverEntry(
    input: TripDriverInputDto | ResolvedTripDriver,
  ): Promise<ResolvedTripDriver> {
    const normalizedId =
      input.driverId === undefined ||
      input.driverId === null ||
      input.driverId === ''
        ? null
        : input.driverId;
    let normalizedName = this.nullableTrim(input.driverName);
    let normalizedPhone = this.nullableTrim(input.driverPhone);

    if (!normalizedId && !normalizedName) {
      throw new BadRequestException(
        'Each trip driver requires driverId or driverName',
      );
    }

    if (normalizedId) {
      const driver = await this.driverRepo.findOne({
        where: { id: normalizedId },
        relations: { user: true },
      });
      if (!driver) {
        throw new BadRequestException(`Driver not found: ${normalizedId}`);
      }
      if (!normalizedName) {
        normalizedName = this.nullableTrim(driver.user?.name);
      }
      if (!normalizedPhone) {
        normalizedPhone =
          this.nullableTrim(driver.phone) ??
          this.nullableTrim(driver.user?.phone);
      }
    }

    return {
      driverId: normalizedId,
      driverName: normalizedName,
      driverPhone: normalizedPhone,
    };
  }

  private async ensureTrip(tripId: string): Promise<Trip> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(row: TripDriver) {
    const displayName =
      this.nullableTrim(row.driver?.user?.name) ??
      this.nullableTrim(row.driverName);
    const displayPhone =
      this.nullableTrim(row.driver?.phone) ??
      this.nullableTrim(row.driver?.user?.phone) ??
      this.nullableTrim(row.driverPhone);

    return {
      id: row.id,
      tripId: row.tripId,
      driverId: row.driverId ?? null,
      driverName: displayName,
      driverPhone: displayPhone,
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
