import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AssignedDriverListQueryDto,
  ChangeAssignedDriverStatusDto,
  CreateAssignedDriverDto,
  UpdateAssignedDriverDto,
} from '../auth/dto/assigned-driver.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Driver,
  DriverStatus,
  DriverType,
} from '../database/entities/driver.entity';
import {
  AssignedDriver,
  AssignedDriverStatus,
  Vehicle,
  VehicleStatus,
} from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class AssignedDriversService {
  constructor(
    @InjectRepository(AssignedDriver)
    private readonly assignmentRepo: Repository<AssignedDriver>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateAssignedDriverDto, activity?: ActivityActorContext) {
    const driver = await this.ensureDriver(dto.driverId);
    await this.ensureVehicle(dto.vehicleId);

    const status = dto.status ?? AssignedDriverStatus.PENDING;
    const driverType = dto.driverType ?? driver.driverType;

    if (status === AssignedDriverStatus.ASSIGNED) {
      await this.releaseActiveAssignments(
        dto.driverId,
        dto.vehicleId,
        driverType,
      );
    }

    const existingPending = await this.assignmentRepo.findOne({
      where: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        status: AssignedDriverStatus.PENDING,
      },
    });
    if (existingPending && status === AssignedDriverStatus.PENDING) {
      throw new ConflictException(
        'A pending assignment already exists for this driver and vehicle',
      );
    }

    const saved = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        driverType,
        assignedDate: dto.assignedDate
          ? new Date(dto.assignedDate)
          : status === AssignedDriverStatus.ASSIGNED
            ? new Date()
            : null,
        status,
        name: dto.name?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'AssignedDriver',
        entityId: saved.id,
        record: saved.id,
        description: `Assigned driver to vehicle ${saved.vehicleId}`,
        metadata: {
          driverId: saved.driverId,
          vehicleId: saved.vehicleId,
          driverType: saved.driverType,
          status: saved.status,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: AssignedDriverListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.assignmentRepo
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'user')
      .leftJoinAndSelect('assignment.vehicle', 'vehicle')
      .orderBy('assignment.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.driverId) {
      qb.andWhere('assignment.driverId = :driverId', {
        driverId: query.driverId,
      });
    }
    if (query.vehicleId) {
      qb.andWhere('assignment.vehicleId = :vehicleId', {
        vehicleId: query.vehicleId,
      });
    }
    if (query.status) {
      qb.andWhere('assignment.status = :status', { status: query.status });
    }
    if (query.driverType) {
      qb.andWhere('assignment.driverType = :driverType', {
        driverType: query.driverType,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.name ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR assignment.name ILIKE :search
          OR assignment.phone ILIKE :search
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
    return this.toResponse(await this.findByIdOrFail(id));
  }

  async findByVehicle(vehicleId: string, status?: AssignedDriverStatus) {
    await this.ensureVehicleExists(vehicleId);
    const rows = await this.assignmentRepo.find({
      where: status ? { vehicleId, status } : { vehicleId },
      relations: {
        driver: { user: true },
        vehicle: true,
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findByDriver(driverId: string, status?: AssignedDriverStatus) {
    await this.ensureDriver(driverId);
    const rows = await this.assignmentRepo.find({
      where: status ? { driverId, status } : { driverId },
      relations: {
        driver: { user: true },
        vehicle: true,
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  /** Trip create — drivers currently ASSIGNED to this vehicle. */
  async listDriversUtilityForVehicle(
    vehicleId: string,
    opts: { search?: string } = {},
  ) {
    await this.ensureVehicleExists(vehicleId);

    const qb = this.assignmentRepo
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('assignment.vehicleId = :vehicleId', { vehicleId })
      .andWhere('assignment.status = :status', {
        status: AssignedDriverStatus.ASSIGNED,
      })
      .andWhere('driver.status = :driverStatus', {
        driverStatus: DriverStatus.ACTIVE,
      })
      .orderBy('user.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.name ILIKE :search
          OR driver.phone ILIKE :search
          OR driver.licenseNo ILIKE :search
          OR CAST(assignment.driverType AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    const seen = new Set<string>();
    const data: Array<{
      id: string;
      label: string;
      driverType: string;
      phone: string | null;
      licenseNo: string | null;
      assignmentId: string;
      user: { id: string; name: string; phone: string | null } | null;
    }> = [];

    for (const row of rows) {
      if (seen.has(row.driverId)) continue;
      seen.add(row.driverId);
      const name = row.driver?.user?.name ?? row.name ?? row.driverId;
      data.push({
        id: row.driverId,
        label: name,
        driverType: row.driverType,
        phone: row.driver.phone ?? row.phone ?? null,
        licenseNo: row.driver.licenseNo ?? null,
        assignmentId: row.id,
        user: row.driver?.user
          ? {
              id: row.driver.user.id,
              name: row.driver.user.name,
              phone: row.driver.user.phone ?? null,
            }
          : null,
      });
    }

    return { data };
  }

  async update(
    id: string,
    dto: UpdateAssignedDriverDto,
    activity?: ActivityActorContext,
  ) {
    const row = await this.findByIdOrFail(id);

    if (dto.driverId !== undefined) {
      await this.ensureDriver(dto.driverId);
      row.driverId = dto.driverId;
    }
    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      row.vehicleId = dto.vehicleId;
    }
    if (dto.driverType !== undefined) {
      row.driverType = dto.driverType;
    }
    if (dto.assignedDate !== undefined) {
      row.assignedDate = dto.assignedDate
        ? new Date(dto.assignedDate)
        : null;
    }
    if (dto.name !== undefined) row.name = dto.name?.trim() || null;
    if (dto.phone !== undefined) row.phone = dto.phone?.trim() || null;
    if (dto.address !== undefined) {
      row.address = dto.address?.trim() || null;
    }

    await this.assignmentRepo.save(row);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'AssignedDriver',
        entityId: id,
        record: id,
        description: `Updated driver assignment ${id}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
          driverType: row.driverType,
          status: row.status,
        },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeAssignedDriverStatusDto,
    activity?: ActivityActorContext,
  ) {
    const row = await this.findByIdOrFail(id);

    if (dto.status === AssignedDriverStatus.ASSIGNED) {
      await this.releaseActiveAssignments(
        row.driverId,
        row.vehicleId,
        row.driverType,
        id,
      );
      if (!row.assignedDate) {
        row.assignedDate = new Date();
      }
    }

    row.status = dto.status;
    await this.assignmentRepo.save(row);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'AssignedDriver',
        entityId: id,
        record: id,
        description: `Changed assignment status to ${dto.status}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
          driverType: row.driverType,
          status: dto.status,
        },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const row = await this.findByIdOrFail(id);
    await this.assignmentRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'AssignedDriver',
        entityId: id,
        record: id,
        description: `Deleted driver assignment ${id}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
          driverType: row.driverType,
        },
      },
      activity,
    );

    return { message: 'Driver assignment deleted' };
  }

  /**
   * - Driver can only be ASSIGNED to one vehicle at a time.
   * - Vehicle can only have one ASSIGNED driver per driverType
   *   (e.g. one 1ST_DRIVER, one HELPER).
   */
  private async releaseActiveAssignments(
    driverId: string,
    vehicleId: string,
    driverType: DriverType,
    excludeId?: string,
  ) {
    const active = await this.assignmentRepo.find({
      where: [
        { driverId, status: AssignedDriverStatus.ASSIGNED },
        { vehicleId, driverType, status: AssignedDriverStatus.ASSIGNED },
      ],
    });

    for (const row of active.filter((r) => r.id !== excludeId)) {
      row.status = AssignedDriverStatus.UNASSIGNED;
      await this.assignmentRepo.save(row);
    }
  }

  private async findByIdOrFail(id: string): Promise<AssignedDriver> {
    const row = await this.assignmentRepo.findOne({
      where: { id },
      relations: {
        driver: { user: true },
        vehicle: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Driver assignment not found');
    }
    return row;
  }

  private async ensureDriver(driverId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  private async ensureVehicle(vehicleId: string) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException('Vehicle is not active');
    }
  }

  private async ensureVehicleExists(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private toResponse(row: AssignedDriver) {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      driverId: row.driverId,
      driverType: row.driverType,
      assignedDate: row.assignedDate ?? null,
      status: row.status,
      name: row.name ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      driver: row.driver
        ? {
            id: row.driver.id,
            driverType: row.driver.driverType,
            phone: row.driver.phone ?? null,
            user: row.driver.user
              ? {
                  id: row.driver.user.id,
                  name: row.driver.user.name,
                  email: row.driver.user.email,
                  code: row.driver.user.code,
                }
              : null,
          }
        : null,
      vehicle: row.vehicle
        ? {
            id: row.vehicle.id,
            regNo: row.vehicle.regNo,
            ownership: row.vehicle.ownership,
            status: row.vehicle.status,
            ownerFirstName: row.vehicle.ownerFirstName,
            ownerLastName: row.vehicle.ownerLastName,
          }
        : null,
    };
  }
}
