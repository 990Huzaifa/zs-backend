import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateClientTypeDto,
  UpdateClientTypeDto,
} from '../auth/dto/client-type.dto';
import { ClientType } from '../database/entities/client.entity';

/** Spaces → hyphens, lowercase (e.g. "Factory Client" → "factory-client"). */
function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class ClientTypesService {
  constructor(
    @InjectRepository(ClientType)
    private readonly clientTypeRepo: Repository<ClientType>,
  ) {}

  async create(dto: CreateClientTypeDto): Promise<ClientType> {
    const name = dto.name.trim();
    const slug = (
      dto.slug?.trim() ? dto.slug.trim() : slugFromName(name)
    ).toLowerCase();
    if (!slug) {
      throw new BadRequestException('Slug could not be generated from name');
    }
    await this.ensureUniqueSlug(slug);

    return this.clientTypeRepo.save(
      this.clientTypeRepo.create({ name, slug }),
    );
  }

  async findAll(): Promise<ClientType[]> {
    return this.clientTypeRepo.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ClientType> {
    const row = await this.clientTypeRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Client type not found');
    }
    return row;
  }

  async update(id: string, dto: UpdateClientTypeDto): Promise<ClientType> {
    const clientType = await this.findOne(id);

    if (dto.name !== undefined) {
      clientType.name = dto.name.trim();
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (!slug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      if (slug !== clientType.slug) {
        await this.ensureUniqueSlug(slug, id);
      }
      clientType.slug = slug;
    }

    await this.clientTypeRepo.save(clientType);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.clientTypeRepo.delete(id);
    return { message: 'Client type deleted' };
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const existing = await this.clientTypeRepo.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Client type slug already exists');
    }
  }
}
