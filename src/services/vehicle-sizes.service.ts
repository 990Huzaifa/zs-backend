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
  CreateVehicleSizeDto,
  UpdateVehicleSizeDto,
} from '../auth/dto/vehicle-master.dto';
import { slugFromName } from '../common/utils/slug.util';
import { VehicleSize } from '../database/entities/vehicle.entity';

type VehicleSizeWithCount = VehicleSize & { vehicleCount: number };

@Injectable()
export class VehicleSizesService {
  constructor(
    @InjectRepository(VehicleSize)
    private readonly sizeRepo: Repository<VehicleSize>,
  ) {}

  async create(dto: CreateVehicleSizeDto): Promise<VehicleSizeWithCount> {
    const name = dto.name.trim();
    const slug = (
      dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)
    ).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    const saved = await this.sizeRepo.save(
      this.sizeRepo.create({
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
  }): Promise<VehicleSizeWithCount[]> {
    const qb = this.sizeRepo
      .createQueryBuilder('s')
      .loadRelationCountAndMap('s.vehicleCount', 's.vehicles')
      .orderBy('s.name', 'ASC');

    if (query?.search?.trim()) {
      qb.andWhere('(s.name ILIKE :search OR s.slug ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }
    if (query?.isActive !== undefined) {
      qb.andWhere('s.isActive = :isActive', { isActive: query.isActive });
    }

    return (await qb.getMany()) as VehicleSizeWithCount[];
  }

  async findOne(id: string): Promise<VehicleSizeWithCount> {
    const row = await this.sizeRepo
      .createQueryBuilder('s')
      .where('s.id = :id', { id })
      .loadRelationCountAndMap('s.vehicleCount', 's.vehicles')
      .getOne();
    if (!row) {
      throw new NotFoundException('Vehicle size not found');
    }
    return row as VehicleSizeWithCount;
  }

  async update(
    id: string,
    dto: UpdateVehicleSizeDto,
  ): Promise<VehicleSizeWithCount> {
    const item = await this.sizeRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle size not found');
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

    await this.sizeRepo.save(item);
    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleMasterStatusDto,
  ): Promise<VehicleSizeWithCount> {
    const item = await this.sizeRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Vehicle size not found');
    }
    item.isActive = dto.isActive;
    await this.sizeRepo.save(item);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const item = await this.findOne(id);
    if (item.vehicleCount > 0) {
      throw new BadRequestException(
        'Cannot delete vehicle size that is assigned to vehicles',
      );
    }
    await this.sizeRepo.delete(id);
    return { message: 'Vehicle size deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const where: FindOptionsWhere<VehicleSize> = { slug };
    const existing = await this.sizeRepo.findOne({ where });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vehicle size slug already exists');
    }
  }
}
