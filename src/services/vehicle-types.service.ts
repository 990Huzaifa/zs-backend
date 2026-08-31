import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  ChangeVehicleMasterStatusDto,
  CreateVehicleTypeDto,
  UpdateVehicleTypeDto,
} from '../auth/dto/vehicle-master.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { slugFromName } from '../common/utils/slug.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { VehicleType } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

type VehicleTypeWithCount = VehicleType & { vehicleCount: number };

@Injectable()
export class VehicleTypesService {
  constructor(
    @InjectRepository(VehicleType)
    private readonly typeRepo: Repository<VehicleType>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateVehicleTypeDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleTypeWithCount> {
    const name = dto.name.trim();
    const slug = (
      dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)
    ).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    const saved = await this.typeRepo.save(
      this.typeRepo.create({
        name,
        slug,
        measurement: dto.measurement,
        isActive: dto.isActive ?? true,
      }),
    );
    const result = { ...saved, vehicleCount: 0 };
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleType',
        entityId: saved.id,
        record: saved.name,
        description: `Created vehicle type ${saved.name}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query?: {
    search?: string;
    isActive?: boolean;
  }): Promise<VehicleTypeWithCount[]> {
    const qb = this.typeRepo
      .createQueryBuilder('t')
      .loadRelationCountAndMap('t.vehicleCount', 't.vehicles')
      .orderBy('t.name', 'ASC');

    if (query?.search?.trim()) {
      qb.andWhere('(t.name ILIKE :search OR t.slug ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }
    if (query?.isActive !== undefined) {
      qb.andWhere('t.isActive = :isActive', { isActive: query.isActive });
    }

    return (await qb.getMany()) as VehicleTypeWithCount[];
  }

  /** Lightweight dropdown (active types by default). */
  async listUtility(opts: { search?: string; isActive?: boolean } = {}) {
    const qb = this.typeRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.name', 't.slug', 't.measurement', 't.isActive'])
      .orderBy('t.name', 'ASC');

    qb.andWhere('t.isActive = :isActive', {
      isActive: opts.isActive ?? true,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('(t.name ILIKE :search OR t.slug ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((t) => ({
        id: t.id,
        label: t.name,
        name: t.name,
        slug: t.slug,
        measurement: t.measurement,
        isActive: t.isActive,
      })),
    };
  }

  async findOne(id: string): Promise<VehicleTypeWithCount> {
    const row = await this.typeRepo
      .createQueryBuilder('t')
      .where('t.id = :id', { id })
      .loadRelationCountAndMap('t.vehicleCount', 't.vehicles')
      .getOne();
    if (!row) {
      throw new NotFoundException('Vehicle type not found');
    }
    return row as VehicleTypeWithCount;
  }

  async update(
    id: string,
    dto: UpdateVehicleTypeDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleTypeWithCount> {
    const item = await this.typeRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle type not found');
    }

    if (dto.name !== undefined) {
      item.name = dto.name.trim();
    }
    if (dto.measurement !== undefined) {
      item.measurement = dto.measurement;
    }
    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (!slug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      if (slug !== item.slug) {
        await this.ensureUniqueSlug(slug, id);
      }
      item.slug = slug;
    }

    await this.typeRepo.save(item);
    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleType',
        entityId: id,
        record: result.name,
        description: `Updated vehicle type ${result.name}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleMasterStatusDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleTypeWithCount> {
    const item = await this.typeRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle type not found');
    }
    item.isActive = dto.isActive;
    await this.typeRepo.save(item);
    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleType',
        entityId: id,
        record: result.name,
        description: `Changed vehicle type ${result.name} status to ${
          dto.isActive ? 'active' : 'inactive'
        }`,
      },
      activity,
    );
    return result;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const item = await this.findOne(id);
    if (item.vehicleCount > 0) {
      throw new BadRequestException(
        'Cannot delete vehicle type that is assigned to vehicles',
      );
    }
    await this.typeRepo.delete(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleType',
        entityId: id,
        record: item.name,
        description: `Deleted vehicle type ${item.name}`,
      },
      activity,
    );
    return { message: 'Vehicle type deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const where: FindOptionsWhere<VehicleType> = { slug };
    const existing = await this.typeRepo.findOne({ where });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vehicle type slug already exists');
    }
  }
}
