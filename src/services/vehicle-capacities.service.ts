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
import { slugFromName } from '../common/utils/slug.util';
import { VehicleCapacity } from '../database/entities/vehicle.entity';

type VehicleCapacityWithCount = VehicleCapacity & { vehicleCount: number };

@Injectable()
export class VehicleCapacitiesService {
  constructor(
    @InjectRepository(VehicleCapacity)
    private readonly capacityRepo: Repository<VehicleCapacity>,
  ) {}

  async create(
    dto: CreateVehicleCapacityDto,
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
    return { ...saved, vehicleCount: 0 };
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
    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleMasterStatusDto,
  ): Promise<VehicleCapacityWithCount> {
    const item = await this.capacityRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle capacity not found');
    }
    item.isActive = dto.isActive;
    await this.capacityRepo.save(item);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const item = await this.findOne(id);
    if (item.vehicleCount > 0) {
      throw new BadRequestException(
        'Cannot delete vehicle capacity that is assigned to vehicles',
      );
    }
    await this.capacityRepo.delete(id);
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
