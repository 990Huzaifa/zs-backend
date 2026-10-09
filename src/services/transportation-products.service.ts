import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChangeTransportationProductStatusDto,
  CreateTransportationProductDto,
  TransportationProductListQueryDto,
  UpdateTransportationProductDto,
} from '../auth/dto/transportation-product.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { TransportationProduct } from '../database/entities/transportation-product.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class TransportationProductsService {
  constructor(
    @InjectRepository(TransportationProduct)
    private readonly productRepo: Repository<TransportationProduct>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateTransportationProductDto,
    activity?: ActivityActorContext,
  ) {
    const name = dto.name.trim();
    await this.ensureUniqueName(name);

    const saved = await this.productRepo.save(
      this.productRepo.create({
        name,
        status: dto.status ?? true,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'TransportationProduct',
        entityId: saved.id,
        record: saved.name,
        description: `Created transportation product ${saved.name}`,
      },
      activity,
    );

    return saved;
  }

  async findAll(query: TransportationProductListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('p.name ILIKE :search', { search: `%${search}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('p.status = :status', { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /** Dropdown — active products by default. */
  async listUtility(opts: { search?: string; status?: boolean } = {}) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.status'])
      .orderBy('p.name', 'ASC');

    qb.andWhere('p.status = :status', {
      status: opts.status ?? true,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('p.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((p) => ({
        id: p.id,
        label: p.name,
        name: p.name,
        status: p.status,
      })),
    };
  }

  async findOne(id: string) {
    return this.findByIdOrFail(id);
  }

  async update(
    id: string,
    dto: UpdateTransportationProductDto,
    activity?: ActivityActorContext,
  ) {
    const item = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureUniqueName(name, id);
      item.name = name;
    }

    await this.productRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TransportationProduct',
        entityId: id,
        record: item.name,
        description: `Updated transportation product ${item.name}`,
      },
      activity,
    );

    return item;
  }

  async changeStatus(
    id: string,
    dto: ChangeTransportationProductStatusDto,
    activity?: ActivityActorContext,
  ) {
    const item = await this.findByIdOrFail(id);
    item.status = dto.status;
    await this.productRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TransportationProduct',
        entityId: id,
        record: item.name,
        description: `Changed transportation product ${item.name} status to ${
          dto.status ? 'active' : 'inactive'
        }`,
      },
      activity,
    );

    return item;
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const item = await this.findByIdOrFail(id);
    await this.productRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'TransportationProduct',
        entityId: id,
        record: item.name,
        description: `Deleted transportation product ${item.name}`,
      },
      activity,
    );

    return { message: 'Transportation product deleted' };
  }

  private async findByIdOrFail(id: string) {
    const item = await this.productRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Transportation product not found');
    }
    return item;
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const existing = await this.productRepo
      .createQueryBuilder('p')
      .where('LOWER(p.name) = LOWER(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Transportation product name already exists');
    }
  }
}
