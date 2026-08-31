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
  CreateVehicleCapacityDto,
  UpdateVehicleCapacityDto,
} from '../auth/dto/vehicle-master.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { slugFromName } from '../common/utils/slug.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { VehicleCapacity } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

type VehicleCapacityWithCount = VehicleCapacity & { vehicleCount: number };

@Injectable()
export class VehicleCapacitiesService {
  constructor(
    @InjectRepository(VehicleCapacity)
    private readonly capacityRepo: Repository<VehicleCapacity>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateVehicleCapacityDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleCapacityWithCount> {
    const name = dto.name.trim();
    const slug = (
      dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)
    ).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    const saved = await this.capacityRepo.save(
      this.capacityRepo.create({
        name,
        slug,
        isActive: dto.isActive ?? true,
      }),
    );
    const result = { ...saved, vehicleCount: 0 };
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleCapacity',
        entityId: saved.id,
        record: saved.name,
        description: `Created vehicle capacity ${saved.name}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query?: {
    search?: string;
    isActive?: boolean;
  }): Promise<VehicleCapacityWithCount[]> {
    const qb = this.capacityRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.vehicleCount', 'c.vehicles')
      .orderBy('c.name', 'ASC');

    if (query?.search?.trim()) {
      qb.andWhere('(c.name ILIKE :search OR c.slug ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }
    if (query?.isActive !== undefined) {
      qb.andWhere('c.isActive = :isActive', { isActive: query.isActive });
    }

    return (await qb.getMany()) as VehicleCapacityWithCount[];
  }

  /** Lightweight dropdown (active capacities by default). */
  async listUtility(opts: { search?: string; isActive?: boolean } = {}) {
    const qb = this.capacityRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.slug', 'c.isActive'])
      .orderBy('c.name', 'ASC');

    qb.andWhere('c.isActive = :isActive', {
      isActive: opts.isActive ?? true,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('(c.name ILIKE :search OR c.slug ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((c) => ({
        id: c.id,
        label: c.name,
        name: c.name,
        slug: c.slug,
        isActive: c.isActive,
      })),
    };
  }

  async findOne(id: string): Promise<VehicleCapacityWithCount> {
    const row = await this.capacityRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .loadRelationCountAndMap('c.vehicleCount', 'c.vehicles')
      .getOne();
    if (!row) {
      throw new NotFoundException('Vehicle capacity not found');
    }
    return row as VehicleCapacityWithCount;
  }

  async update(
    id: string,
    dto: UpdateVehicleCapacityDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleCapacityWithCount> {
    const item = await this.capacityRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle capacity not found');
    }

    if (dto.name !== undefined) {
      item.name = dto.name.trim();
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

    await this.capacityRepo.save(item);
    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleCapacity',
        entityId: id,
        record: result.name,
        description: `Updated vehicle capacity ${result.name}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleMasterStatusDto,
    activity?: ActivityActorContext,
  ): Promise<VehicleCapacityWithCount> {
    const item = await this.capacityRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle capacity not found');
    }
    item.isActive = dto.isActive;
    await this.capacityRepo.save(item);
    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleCapacity',
        entityId: id,
        record: result.name,
        description: `Changed vehicle capacity ${result.name} status to ${
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
        'Cannot delete vehicle capacity that is assigned to vehicles',
      );
    }
    await this.capacityRepo.delete(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleCapacity',
        entityId: id,
        record: item.name,
        description: `Deleted vehicle capacity ${item.name}`,
      },
      activity,
    );
    return { message: 'Vehicle capacity deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const where: FindOptionsWhere<VehicleCapacity> = { slug };
    const existing = await this.capacityRepo.findOne({ where });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vehicle capacity slug already exists');
    }
  }
}
