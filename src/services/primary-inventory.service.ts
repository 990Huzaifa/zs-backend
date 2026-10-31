import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreatePrimaryInventoryDto,
  PrimaryInventoryListQueryDto,
  UpdatePrimaryGatePassDto,
  UpdatePrimaryInventoryDto,
} from '../auth/dto/primary-inventory.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Bilty } from '../database/entities/bilty.entity';
import { PrimaryInventory } from '../database/entities/inventory.entity';
import { Warehouse } from '../database/entities/warehouse.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class PrimaryInventoryService {
  constructor(
    @InjectRepository(PrimaryInventory)
    private readonly primaryRepo: Repository<PrimaryInventory>,
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreatePrimaryInventoryDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureWarehouse(dto.warehouseId);
    await this.ensureBilty(dto.biltyId);
    await this.ensureUniqueBilty(dto.biltyId);

    const saved = await this.primaryRepo.save(
      this.primaryRepo.create({
        warehouseId: dto.warehouseId,
        biltyId: dto.biltyId,
        gatePassNumber: this.nullableTrim(dto.gatePassNumber),
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'PrimaryInventory',
        entityId: saved.id,
        record: saved.gatePassNumber ?? saved.id,
        description: `Created primary inventory for bilty ${dto.biltyId}`,
        metadata: {
          biltyId: dto.biltyId,
          warehouseId: dto.warehouseId,
        },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  /**
   * Auto-create primary when a warehousing bilty goes IN_TRANSIT (from trip load).
   * Requires `isWarehousing` + `warehouseId`. Idempotent if row already exists.
   */
  async ensureCreatedForInTransitWarehousingBilty(
    bilty: Bilty,
    opts: {
      manager?: EntityManager;
      activity?: ActivityActorContext;
      source?: string;
    } = {},
  ): Promise<PrimaryInventory | null> {
    if (!bilty.isWarehousing || !bilty.warehouseId) {
      return null;
    }

    const repo = opts.manager
      ? opts.manager.getRepository(PrimaryInventory)
      : this.primaryRepo;

    const existing = await repo.findOne({ where: { biltyId: bilty.id } });
    if (existing) {
      return existing;
    }

    const warehouseExists = opts.manager
      ? await opts.manager.getRepository(Warehouse).exist({
          where: { id: bilty.warehouseId },
        })
      : await this.warehouseRepo.exist({ where: { id: bilty.warehouseId } });
    if (!warehouseExists) {
      throw new NotFoundException('Warehouse not found');
    }

    const saved = await repo.save(
      repo.create({
        warehouseId: bilty.warehouseId,
        biltyId: bilty.id,
        gatePassNumber: null,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'PrimaryInventory',
        entityId: saved.id,
        record: bilty.code,
        description: `Auto-created primary inventory for bilty ${bilty.code} (IN_TRANSIT warehousing)`,
        metadata: {
          biltyId: bilty.id,
          biltyCode: bilty.code,
          warehouseId: bilty.warehouseId,
          source: opts.source ?? 'bilty_in_transit',
        },
      },
      opts.activity,
    );

    return saved;
  }

  async findAll(query: PrimaryInventoryListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.primaryRepo
      .createQueryBuilder('primary')
      .leftJoinAndSelect('primary.warehouse', 'warehouse')
      .leftJoinAndSelect('warehouse.client', 'warehouseClient')
      .leftJoinAndSelect('primary.bilty', 'bilty')
      .leftJoinAndSelect('bilty.vehicle', 'vehicle')
      .leftJoinAndSelect('bilty.offLoadings', 'offLoading')
      .orderBy('bilty.issueDate', 'DESC')
      .addOrderBy('primary.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.warehouseId) {
      qb.andWhere('primary.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }
    if (query.biltyId) {
      qb.andWhere('primary.biltyId = :biltyId', { biltyId: query.biltyId });
    }
    if (query.dateFrom) {
      qb.andWhere('bilty.issueDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('bilty.issueDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }
    if (query.month) {
      const year = query.year ?? new Date().getFullYear();
      qb.andWhere('EXTRACT(MONTH FROM bilty.issueDate) = :month', {
        month: query.month,
      });
      qb.andWhere('EXTRACT(YEAR FROM bilty.issueDate) = :year', { year });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          bilty.code ILIKE :search
          OR primary.gatePassNumber ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR bilty.vehicleRegistrationNumber ILIKE :search
          OR warehouseClient.companyName ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row, index) =>
        this.toListItem(row, skip + index + 1),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const row = await this.loadOne(id);
    return this.toListItem(row);
  }

  async update(
    id: string,
    dto: UpdatePrimaryInventoryDto,
    activity?: ActivityActorContext,
  ) {
    const row = await this.primaryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Primary inventory not found');
    }

    if (dto.warehouseId !== undefined) {
      await this.ensureWarehouse(dto.warehouseId);
      row.warehouseId = dto.warehouseId;
    }
    if (dto.gatePassNumber !== undefined) {
      row.gatePassNumber = this.nullableTrim(dto.gatePassNumber);
    }

    await this.primaryRepo.save(row);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'PrimaryInventory',
        entityId: id,
        record: row.gatePassNumber ?? id,
        description: `Updated primary inventory ${id}`,
        metadata: { biltyId: row.biltyId, warehouseId: row.warehouseId },
      },
      activity,
    );

    return this.findOne(id);
  }

  async updateGatePass(
    id: string,
    dto: UpdatePrimaryGatePassDto,
    activity?: ActivityActorContext,
  ) {
    const row = await this.primaryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Primary inventory not found');
    }

    const previous = row.gatePassNumber ?? null;
    row.gatePassNumber = dto.gatePassNumber.trim();
    await this.primaryRepo.save(row);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'PrimaryInventory',
        entityId: id,
        record: row.gatePassNumber,
        description: `Updated primary inventory gate pass to ${row.gatePassNumber}`,
        metadata: {
          biltyId: row.biltyId,
          warehouseId: row.warehouseId,
          previousGatePassNumber: previous,
          gatePassNumber: row.gatePassNumber,
        },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const row = await this.primaryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Primary inventory not found');
    }

    await this.primaryRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'PrimaryInventory',
        entityId: id,
        record: row.gatePassNumber ?? id,
        description: `Deleted primary inventory ${id}`,
        metadata: { biltyId: row.biltyId, warehouseId: row.warehouseId },
      },
      activity,
    );

    return { message: 'Primary inventory deleted' };
  }

  private async loadOne(id: string) {
    const row = await this.primaryRepo.findOne({
      where: { id },
      relations: {
        warehouse: { client: true },
        bilty: { vehicle: true, offLoadings: true },
      },
    });
    if (!row) {
      throw new NotFoundException('Primary inventory not found');
    }
    return row;
  }

  private async ensureWarehouse(warehouseId: string) {
    const exists = await this.warehouseRepo.exist({
      where: { id: warehouseId },
    });
    if (!exists) {
      throw new NotFoundException('Warehouse not found');
    }
  }

  private async ensureBilty(biltyId: string) {
    const exists = await this.biltyRepo.exist({ where: { id: biltyId } });
    if (!exists) {
      throw new NotFoundException('Bilty not found');
    }
  }

  private async ensureUniqueBilty(biltyId: string, excludeId?: string) {
    const existing = await this.primaryRepo.findOne({ where: { biltyId } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Primary inventory already exists for this bilty',
      );
    }
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  /** Arrival from bilty offloading datetime (not stored on primary_inventory). */
  private resolveArrivalDate(bilty?: Bilty | null): string | Date | null {
    const dates = (bilty?.offLoadings ?? [])
      .map((o) => o.offLoadingDateTime)
      .filter((d): d is Date => !!d)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return dates[0] ?? null;
  }

  /**
   * Table row shape for Primary list UI.
   * Dispatch / bilty / vehicle / cartons / pairs from bilty;
   * gate pass + arrival from primary; warehouse from warehouse.
   */
  private toListItem(row: PrimaryInventory, serialNo?: number) {
    const bilty = row.bilty;
    const warehouse = row.warehouse;
    const clientName = warehouse?.client?.companyName?.trim() || null;
    const vehicleNo =
      bilty?.vehicle?.regNo ?? bilty?.vehicleRegistrationNumber ?? null;
    const arrivalDate = this.resolveArrivalDate(bilty);

    return {
      id: row.id,
      serialNo: serialNo ?? null,
      dispatchDate: bilty?.issueDate ?? null,
      biltyId: row.biltyId,
      biltyCode: bilty?.code ?? null,
      gatePassNumber: row.gatePassNumber ?? null,
      primaryVehicle: vehicleNo,
      cartons: bilty?.noOfPackages ?? null,
      pairs: bilty?.noOfPairs ?? null,
      arrivalDate,
      warehouseId: row.warehouseId,
      warehouseName: clientName,
      warehouse: warehouse
        ? {
            id: warehouse.id,
            clientId: warehouse.clientId ?? null,
            clientName,
            client: warehouse.client
              ? {
                  id: warehouse.client.id,
                  companyName: warehouse.client.companyName,
                }
              : null,
          }
        : null,
      bilty: bilty
        ? {
            id: bilty.id,
            code: bilty.code,
            issueDate: bilty.issueDate,
            noOfPackages: bilty.noOfPackages ?? null,
            noOfPairs: bilty.noOfPairs ?? null,
            vehicleId: bilty.vehicleId ?? null,
            vehicleRegistrationNumber:
              bilty.vehicleRegistrationNumber ?? null,
            vehicle: bilty.vehicle
              ? {
                  id: bilty.vehicle.id,
                  regNo: bilty.vehicle.regNo,
                }
              : null,
            isWarehousing: bilty.isWarehousing ?? false,
            warehouseId: bilty.warehouseId ?? null,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
