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
import { slugFromName } from '../common/utils/slug.util';
import { VehicleType } from '../database/entities/vehicle.entity';

type VehicleTypeWithCount = VehicleType & { vehicleCount: number };

@Injectable()
export class VehicleTypesService {
  constructor(
    @InjectRepository(VehicleType)
    private readonly typeRepo: Repository<VehicleType>,
  ) {}

  async create(dto: CreateVehicleTypeDto): Promise<VehicleTypeWithCount> {
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
    return { ...saved, vehicleCount: 0 };
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
    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleMasterStatusDto,
  ): Promise<VehicleTypeWithCount> {
    const item = await this.typeRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle type not found');
    }
    item.isActive = dto.isActive;
    await this.typeRepo.save(item);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const item = await this.findOne(id);
    if (item.vehicleCount > 0) {
      throw new BadRequestException(
        'Cannot delete vehicle type that is assigned to vehicles',
      );
    }
    await this.typeRepo.delete(id);
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
