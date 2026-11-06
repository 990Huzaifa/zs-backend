import {
  BadRequestException,
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
  WAREHOUSE_CODE_PAD,
  WAREHOUSE_CODE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Client } from '../database/entities/client.entity';
import { Warehouse } from '../database/entities/warehousing/warehouse.entity';
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

    const warehouseCode = await this.generateUniqueWarehouseCode(repo);
    const saved = await repo.save(repo.create({ warehouseCode, clientId }));

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: saved.id,
        record: saved.warehouseCode,
        description: `Auto-created warehouse ${saved.warehouseCode} for client ${clientId}`,
        metadata: {
          warehouseCode: saved.warehouseCode,
          clientId,
          source: 'isWarehouseOwner',
        },
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

    const warehouseCode = await this.generateUniqueWarehouseCode();
    const saved = await this.warehouseRepo.save(
      this.warehouseRepo.create({ warehouseCode, clientId }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Warehouse',
        entityId: saved.id,
        record: saved.warehouseCode,
        description: clientId
          ? `Created warehouse ${saved.warehouseCode} for client ${clientId}`
          : `Created warehouse ${saved.warehouseCode}`,
        metadata: { warehouseCode: saved.warehouseCode, clientId },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  /**
   * Dropdown — id + warehouseCode (label).
   */
  async listUtility(
    opts: { search?: string; clientId?: string } = {},
  ) {
    const qb = this.warehouseRepo
      .createQueryBuilder('warehouse')
      .leftJoin('warehouse.client', 'client')
      .select([
        'warehouse.id',
        'warehouse.warehouseCode',
        'warehouse.clientId',
        'client.id',
        'client.companyName',
      ])
      .orderBy('warehouse.warehouseCode', 'ASC')
      .addOrderBy('warehouse.createdAt', 'DESC');

    if (opts.clientId) {
      qb.andWhere('warehouse.clientId = :clientId', {
        clientId: opts.clientId,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          warehouse.warehouseCode ILIKE :search
          OR client.companyName ILIKE :search
          OR CAST(warehouse.id AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((w) => {
        const warehouseCode = w.warehouseCode?.trim() || null;
        const clientName = w.client?.companyName?.trim() || null;
        return {
          id: w.id,
          warehouseCode,
          clientName,
          label: warehouseCode ?? clientName ?? w.id,
        };
      }),
    };
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
          warehouse.warehouseCode ILIKE :search
          OR client.companyName ILIKE :search
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
        record: warehouse.warehouseCode,
        description: `Updated warehouse ${warehouse.warehouseCode}`,
        metadata: {
          warehouseCode: warehouse.warehouseCode,
          clientId: warehouse.clientId,
        },
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
        record: warehouse.warehouseCode,
        description: `Deleted warehouse ${warehouse.warehouseCode}`,
        metadata: {
          warehouseCode: warehouse.warehouseCode,
          clientId: warehouse.clientId,
        },
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

  /** Next unused `WH-0001` style code. */
  private async generateUniqueWarehouseCode(
    repo: Repository<Warehouse> = this.warehouseRepo,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const warehouseCode = await nextSerialCode(
        repo,
        WAREHOUSE_CODE_PREFIX,
        'warehouseCode',
        WAREHOUSE_CODE_PAD,
        attempt,
      );
      const existing = await repo.findOne({ where: { warehouseCode } });
      if (!existing) return warehouseCode;
    }
    throw new BadRequestException('Could not generate warehouse code');
  }

  private toResponse(warehouse: Warehouse) {
    return {
      id: warehouse.id,
      warehouseCode: warehouse.warehouseCode ?? null,
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
