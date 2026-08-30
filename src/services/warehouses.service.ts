import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseListQueryDto,
} from '../auth/dto/warehouse.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Client } from '../database/entities/client.entity';
import { Warehouse } from '../database/entities/warehouse.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Ensure a warehouse exists for a warehouse-owner client.
   * Idempotent: returns existing warehouse if one is already linked.
   */
  async ensureForClient(
    clientId: string,
    activity?: ActivityActorContext,
    manager?: EntityManager,
  ): Promise<Warehouse> {
    const repo = manager
      ? manager.getRepository(Warehouse)
      : this.warehouseRepo;

    const existing = await repo.findOne({
      where: { clientId },
      order: { createdAt: 'ASC' },
    });
    if (existing) {
      return existing;
    }

    if (!manager) {
      await this.ensureClientExists(clientId);
    }

    const saved = await repo.save(repo.create({ clientId }));

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: saved.id,
        record: saved.id,
        description: `Auto-created warehouse for client ${clientId}`,
        metadata: { clientId, source: 'isWarehouseOwner' },
      },
      activity,
    );

    return saved;
  }

  async create(dto: CreateWarehouseDto, activity?: ActivityActorContext) {
    const clientId = dto.clientId?.trim() || null;
    if (clientId) {
      await this.ensureClientExists(clientId);
      const existing = await this.warehouseRepo.findOne({
        where: { clientId },
      });
      if (existing) {
        throw new ConflictException(
          'A warehouse already exists for this client',
        );
      }
    }

    const saved = await this.warehouseRepo.save(
      this.warehouseRepo.create({ clientId }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: saved.id,
        record: saved.id,
        description: clientId
          ? `Created warehouse for client ${clientId}`
          : 'Created warehouse',
        metadata: { clientId },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: WarehouseListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.warehouseRepo
      .createQueryBuilder('warehouse')
      .leftJoinAndSelect('warehouse.client', 'client')
      .orderBy('warehouse.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.clientId) {
      qb.andWhere('warehouse.clientId = :clientId', {
        clientId: query.clientId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          client.companyName ILIKE :search
          OR client.email ILIKE :search
          OR CAST(warehouse.id AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((w) => this.toResponse(w)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const warehouse = await this.warehouseRepo.findOne({
      where: { id },
      relations: { client: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return this.toResponse(warehouse);
  }

  async findByClient(clientId: string) {
    await this.ensureClientExists(clientId);
    const rows = await this.warehouseRepo.find({
      where: { clientId },
      relations: { client: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((w) => this.toResponse(w));
  }

  async update(
    id: string,
    dto: UpdateWarehouseDto,
    activity?: ActivityActorContext,
  ) {
    const warehouse = await this.warehouseRepo.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    if (dto.clientId !== undefined) {
      const clientId = dto.clientId?.trim() || null;
      if (clientId) {
        await this.ensureClientExists(clientId);
        const existing = await this.warehouseRepo.findOne({
          where: { clientId },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            'A warehouse already exists for this client',
          );
        }
      }
      warehouse.clientId = clientId;
    }

    await this.warehouseRepo.save(warehouse);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: id,
        record: id,
        description: `Updated warehouse ${id}`,
        metadata: { clientId: warehouse.clientId },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const warehouse = await this.warehouseRepo.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    await this.warehouseRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: id,
        record: id,
        description: `Deleted warehouse ${id}`,
        metadata: { clientId: warehouse.clientId },
      },
      activity,
    );

    return { message: 'Warehouse deleted' };
  }

  private async ensureClientExists(clientId: string) {
    const exists = await this.clientRepo.exist({ where: { id: clientId } });
    if (!exists) {
      throw new NotFoundException('Client not found');
    }
  }

  private toResponse(warehouse: Warehouse) {
    return {
      id: warehouse.id,
      clientId: warehouse.clientId ?? null,
      client: warehouse.client
        ? {
            id: warehouse.client.id,
            companyName: warehouse.client.companyName,
            email: warehouse.client.email,
            isWarehouseOwner: warehouse.client.isWarehouseOwner,
          }
        : null,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }
}
