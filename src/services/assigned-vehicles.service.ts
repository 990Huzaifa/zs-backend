import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AssignedVehicleListQueryDto,
  ChangeAssignedVehicleStatusDto,
  CreateAssignedVehicleDto,
  UpdateAssignedVehicleDto,
} from '../auth/dto/assigned-vehicle.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  AssignedVehicle,
  AssignedVehicleStatus,
  Driver,
} from '../database/entities/driver.entity';
import { Vehicle, VehicleStatus } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class AssignedVehiclesService {
  constructor(
    @InjectRepository(AssignedVehicle)
    private readonly assignmentRepo: Repository<AssignedVehicle>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateAssignedVehicleDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureDriver(dto.driverId);
    await this.ensureVehicle(dto.vehicleId);

    const status = dto.status ?? AssignedVehicleStatus.PENDING;

    if (status === AssignedVehicleStatus.ASSIGNED) {
      await this.releaseActiveAssignments(dto.driverId, dto.vehicleId);
    }

    const existingPending = await this.assignmentRepo.findOne({
      where: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        status: AssignedVehicleStatus.PENDING,
      },
    });
    if (existingPending && status === AssignedVehicleStatus.PENDING) {
      throw new ConflictException(
        'A pending assignment already exists for this driver and vehicle',
      );
    }

    const saved = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        assignedDate: dto.assignedDate
          ? new Date(dto.assignedDate)
          : status === AssignedVehicleStatus.ASSIGNED
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
        entityType: 'AssignedVehicle',
        entityId: saved.id,
        record: saved.id,
        description: `Created vehicle assignment ${saved.id}`,
        metadata: {
          driverId: saved.driverId,
          vehicleId: saved.vehicleId,
          status: saved.status,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: AssignedVehicleListQueryDto) {
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
    const row = await this.findByIdOrFail(id);
    return this.toResponse(row);
  }

  async findByDriver(driverId: string, status?: AssignedVehicleStatus) {
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

  async findByVehicle(vehicleId: string, status?: AssignedVehicleStatus) {
    await this.ensureVehicle(vehicleId);
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

  async update(
    id: string,
    dto: UpdateAssignedVehicleDto,
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
        entityType: 'AssignedVehicle',
        entityId: id,
        record: id,
        description: `Updated vehicle assignment ${id}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
          status: row.status,
        },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeAssignedVehicleStatusDto,
    activity?: ActivityActorContext,
  ) {
    const row = await this.findByIdOrFail(id);

    if (dto.status === AssignedVehicleStatus.ASSIGNED) {
      await this.releaseActiveAssignments(row.driverId, row.vehicleId, id);
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
        entityType: 'AssignedVehicle',
        entityId: id,
        record: id,
        description: `Changed assignment status to ${dto.status}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
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
        entityType: 'AssignedVehicle',
        entityId: id,
        record: id,
        description: `Deleted vehicle assignment ${id}`,
        metadata: {
          driverId: row.driverId,
          vehicleId: row.vehicleId,
        },
      },
      activity,
    );

    return { message: 'Vehicle assignment deleted' };
  }

  /**
   * Mark currently ASSIGNED rows for this driver and/or vehicle as UNASSIGNED
   * so only one active assignment remains per driver and per vehicle.
   */
  private async releaseActiveAssignments(
    driverId: string,
    vehicleId: string,
    excludeId?: string,
  ) {
    const active = await this.assignmentRepo.find({
      where: [
        { driverId, status: AssignedVehicleStatus.ASSIGNED },
        { vehicleId, status: AssignedVehicleStatus.ASSIGNED },
      ],
    });

    const toRelease = active.filter((row) => row.id !== excludeId);
    for (const row of toRelease) {
      row.status = AssignedVehicleStatus.UNASSIGNED;
      await this.assignmentRepo.save(row);
    }
  }

  private async findByIdOrFail(id: string): Promise<AssignedVehicle> {
    const row = await this.assignmentRepo.findOne({
      where: { id },
      relations: {
        driver: { user: true },
        vehicle: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Vehicle assignment not found');
    }
    return row;
  }

  private async ensureDriver(driverId: string) {
    const exists = await this.driverRepo.exist({ where: { id: driverId } });
    if (!exists) {
      throw new NotFoundException('Driver not found');
    }
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

  private toResponse(row: AssignedVehicle) {
    return {
      id: row.id,
      driverId: row.driverId,
      vehicleId: row.vehicleId,
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
