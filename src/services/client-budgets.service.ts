import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ClientBudgetListQueryDto,
  ClientBudgetRouteDto,
  CreateClientBudgetDto,
  UpdateClientBudgetDto,
} from '../auth/dto/client-budget.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Client,
  ClientBudget,
  ClientBudgetRoute,
  ClientDropoffLocation,
  ClientPickupLocation,
} from '../database/entities/client.entity';
import {
  VehicleCapacity,
  VehicleSize,
  VehicleType,
  VehicleTypeMeasurement,
} from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class ClientBudgetsService {
  constructor(
    @InjectRepository(ClientBudget)
    private readonly budgetRepo: Repository<ClientBudget>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(VehicleType)
    private readonly typeRepo: Repository<VehicleType>,
    @InjectRepository(VehicleSize)
    private readonly sizeRepo: Repository<VehicleSize>,
    @InjectRepository(VehicleCapacity)
    private readonly capacityRepo: Repository<VehicleCapacity>,
    @InjectRepository(ClientPickupLocation)
    private readonly pickupRepo: Repository<ClientPickupLocation>,
    @InjectRepository(ClientDropoffLocation)
    private readonly dropoffRepo: Repository<ClientDropoffLocation>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateClientBudgetDto, activity?: ActivityActorContext) {
    await this.ensureClient(dto.clientId);

    const masters = await this.resolveMasters(
      dto.vehicleTypeId,
      dto.vehicleSizeId,
      dto.vehicleCapacityId,
    );
    await this.ensureUniqueBudget(
      dto.clientId,
      masters.vehicleTypeId,
      masters.vehicleSizeId,
      masters.vehicleCapacityId,
    );

    const routes = await this.resolveRoutes(dto.clientId, dto.routes);
    const computed = this.computeFields(dto, dto);

    const saved = await this.budgetRepo.save(
      this.budgetRepo.create({
        clientId: dto.clientId,
        vehicleTypeId: masters.vehicleTypeId,
        vehicleSizeId: masters.vehicleSizeId,
        vehicleCapacityId: masters.vehicleCapacityId,
        routes,
        ...computed,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientBudget',
        entityId: saved.id,
        record: saved.id,
        description: `Created trip expense budget for client ${dto.clientId}`,
        metadata: { clientId: dto.clientId },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: ClientBudgetListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.budgetRepo
      .createQueryBuilder('budget')
      .leftJoinAndSelect('budget.client', 'client')
      .leftJoinAndSelect('budget.vehicleType', 'vehicleType')
      .leftJoinAndSelect('budget.vehicleSize', 'vehicleSize')
      .leftJoinAndSelect('budget.vehicleCapacity', 'vehicleCapacity')
      .orderBy('budget.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.clientId) {
      qb.andWhere('budget.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.vehicleTypeId) {
      qb.andWhere('budget.vehicleTypeId = :vehicleTypeId', {
        vehicleTypeId: query.vehicleTypeId,
      });
    }
    if (query.vehicleSizeId) {
      qb.andWhere('budget.vehicleSizeId = :vehicleSizeId', {
        vehicleSizeId: query.vehicleSizeId,
      });
    }
    if (query.vehicleCapacityId) {
      qb.andWhere('budget.vehicleCapacityId = :vehicleCapacityId', {
        vehicleCapacityId: query.vehicleCapacityId,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findByClient(clientId: string) {
    await this.ensureClient(clientId);
    const rows = await this.budgetRepo.find({
      where: { clientId },
      relations: {
        client: true,
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(id: string) {
    const budget = await this.budgetRepo.findOne({
      where: { id },
      relations: {
        client: true,
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
    });
    if (!budget) {
      throw new NotFoundException('Client budget not found');
    }
    return this.toResponse(budget);
  }

  async update(
    id: string,
    dto: UpdateClientBudgetDto,
    activity?: ActivityActorContext,
  ) {
    const budget = await this.budgetRepo.findOne({ where: { id } });
    if (!budget) {
      throw new NotFoundException('Client budget not found');
    }

    const nextTypeId =
      dto.vehicleTypeId !== undefined
        ? dto.vehicleTypeId
        : budget.vehicleTypeId;
    const nextSizeId =
      dto.vehicleSizeId !== undefined
        ? dto.vehicleSizeId
        : budget.vehicleSizeId;
    const nextCapacityId =
      dto.vehicleCapacityId !== undefined
        ? dto.vehicleCapacityId
        : budget.vehicleCapacityId;

    if (
      dto.vehicleTypeId !== undefined ||
      dto.vehicleSizeId !== undefined ||
      dto.vehicleCapacityId !== undefined
    ) {
      const masters = await this.resolveMasters(
        nextTypeId,
        nextSizeId,
        nextCapacityId,
      );
      await this.ensureUniqueBudget(
        budget.clientId,
        masters.vehicleTypeId,
        masters.vehicleSizeId,
        masters.vehicleCapacityId,
        id,
      );
      budget.vehicleTypeId = masters.vehicleTypeId;
      budget.vehicleSizeId = masters.vehicleSizeId;
      budget.vehicleCapacityId = masters.vehicleCapacityId;
    }

    if (dto.routes !== undefined) {
      budget.routes = await this.resolveRoutes(budget.clientId, dto.routes);
    }

    const merged = this.mergeForCompute(budget, dto);
    const computed = this.computeFields(merged, dto);
    Object.assign(budget, computed);

    await this.budgetRepo.save(budget);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientBudget',
        entityId: id,
        record: id,
        description: `Updated trip expense budget ${id}`,
        metadata: { clientId: budget.clientId },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const budget = await this.budgetRepo.findOne({ where: { id } });
    if (!budget) {
      throw new NotFoundException('Client budget not found');
    }

    await this.budgetRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientBudget',
        entityId: id,
        record: id,
        description: `Deleted trip expense budget ${id}`,
        metadata: { clientId: budget.clientId },
      },
      activity,
    );

    return { message: 'Client budget deleted' };
  }

  private async ensureClient(clientId: string) {
    const exists = await this.clientRepo.exist({ where: { id: clientId } });
    if (!exists) {
      throw new NotFoundException('Client not found');
    }
  }

  private async resolveMasters(
    vehicleTypeId?: string | null,
    vehicleSizeId?: string | null,
    vehicleCapacityId?: string | null,
  ): Promise<{
    vehicleTypeId: string | null;
    vehicleSizeId: string | null;
    vehicleCapacityId: string | null;
  }> {
    const typeId =
      vehicleTypeId === undefined ||
      vehicleTypeId === null ||
      vehicleTypeId === ''
        ? null
        : vehicleTypeId;

    if (!typeId) {
      return {
        vehicleTypeId: null,
        vehicleSizeId: null,
        vehicleCapacityId: null,
      };
    }

    const type = await this.typeRepo.findOne({
      where: { id: typeId, isActive: true },
    });
    if (!type) {
      throw new NotFoundException('Vehicle type not found or inactive');
    }

    if (type.measurement === VehicleTypeMeasurement.SIZE) {
      if (!vehicleSizeId) {
        throw new BadRequestException(
          'vehicleSizeId is required when type measurement is SIZE',
        );
      }
      const size = await this.sizeRepo.findOne({
        where: { id: vehicleSizeId, isActive: true },
      });
      if (!size) {
        throw new NotFoundException('Vehicle size not found or inactive');
      }
      return {
        vehicleTypeId: type.id,
        vehicleSizeId: size.id,
        vehicleCapacityId: null,
      };
    }

    if (!vehicleCapacityId) {
      throw new BadRequestException(
        'vehicleCapacityId is required when type measurement is CAPACITY',
      );
    }
    const capacity = await this.capacityRepo.findOne({
      where: { id: vehicleCapacityId, isActive: true },
    });
    if (!capacity) {
      throw new NotFoundException('Vehicle capacity not found or inactive');
    }
    return {
      vehicleTypeId: type.id,
      vehicleSizeId: null,
      vehicleCapacityId: capacity.id,
    };
  }

  private async ensureUniqueBudget(
    clientId: string,
    vehicleTypeId: string | null,
    vehicleSizeId: string | null,
    vehicleCapacityId: string | null,
    excludeId?: string,
  ) {
    const existing = await this.budgetRepo.findOne({
      where: {
        clientId,
        vehicleTypeId: vehicleTypeId ?? IsNull(),
        vehicleSizeId: vehicleSizeId ?? IsNull(),
        vehicleCapacityId: vehicleCapacityId ?? IsNull(),
      },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'A budget already exists for this client and vehicle type/size/capacity',
      );
    }
  }

  private async resolveRoutes(
    clientId: string,
    routes?: ClientBudgetRouteDto[] | null,
  ): Promise<ClientBudgetRoute[] | null> {
    if (routes === undefined || routes === null) {
      return null;
    }
    if (!routes.length) {
      return [];
    }

    for (const route of routes) {
      const pickup = await this.pickupRepo.findOne({
        where: { id: route.pickupLocationId, clientId },
      });
      if (!pickup) {
        throw new NotFoundException(
          `Pickup location ${route.pickupLocationId} not found for this client`,
        );
      }
      const dropoff = await this.dropoffRepo.findOne({
        where: { id: route.dropoffLocationId, clientId },
      });
      if (!dropoff) {
        throw new NotFoundException(
          `Dropoff location ${route.dropoffLocationId} not found for this client`,
        );
      }
    }

    return routes.map((r) => ({
      pickupLocationId: r.pickupLocationId,
      dropoffLocationId: r.dropoffLocationId,
    }));
  }

  private mergeForCompute(
    budget: ClientBudget,
    dto: UpdateClientBudgetDto,
  ): CreateClientBudgetDto {
    const num = (v: string | null | undefined): number | null =>
      v == null || v === '' ? null : Number(v);

    return {
      clientId: budget.clientId,
      includeReturn:
        dto.includeReturn !== undefined
          ? dto.includeReturn
          : budget.includeReturn,
      oneSideTotalKm:
        dto.oneSideTotalKm !== undefined
          ? dto.oneSideTotalKm
          : num(budget.oneSideTotalKm),
      returnKm:
        dto.returnKm !== undefined ? dto.returnKm : num(budget.returnKm),
      allowExcessKm:
        dto.allowExcessKm !== undefined
          ? dto.allowExcessKm
          : num(budget.allowExcessKm),
      totalKm: dto.totalKm !== undefined ? dto.totalKm : num(budget.totalKm),
      perLtrKmAverage:
        dto.perLtrKmAverage !== undefined
          ? dto.perLtrKmAverage
          : num(budget.perLtrKmAverage),
      fuelLtr: dto.fuelLtr !== undefined ? dto.fuelLtr : num(budget.fuelLtr),
      description:
        dto.description !== undefined
          ? dto.description
          : budget.description ?? null,
      loadingUnloading:
        dto.loadingUnloading !== undefined
          ? dto.loadingUnloading
          : num(budget.loadingUnloading),
      foodPerDay:
        dto.foodPerDay !== undefined
          ? dto.foodPerDay
          : num(budget.foodPerDay),
      noOfDays:
        dto.noOfDays !== undefined ? dto.noOfDays : num(budget.noOfDays),
      totalFoodCash:
        dto.totalFoodCash !== undefined
          ? dto.totalFoodCash
          : num(budget.totalFoodCash),
      tollTaxPerStation:
        dto.tollTaxPerStation !== undefined
          ? dto.tollTaxPerStation
          : num(budget.tollTaxPerStation),
      totalTollTaxStations:
        dto.totalTollTaxStations !== undefined
          ? dto.totalTollTaxStations
          : num(budget.totalTollTaxStations),
      totalTollTax:
        dto.totalTollTax !== undefined
          ? dto.totalTollTax
          : num(budget.totalTollTax),
      policeChallan:
        dto.policeChallan !== undefined
          ? dto.policeChallan
          : num(budget.policeChallan),
      challan: dto.challan !== undefined ? dto.challan : num(budget.challan),
      greasingAirCheckup:
        dto.greasingAirCheckup !== undefined
          ? dto.greasingAirCheckup
          : num(budget.greasingAirCheckup),
      vehicleService:
        dto.vehicleService !== undefined
          ? dto.vehicleService
          : num(budget.vehicleService),
      tyrePunctureEtc:
        dto.tyrePunctureEtc !== undefined
          ? dto.tyrePunctureEtc
          : num(budget.tyrePunctureEtc),
      maintenance:
        dto.maintenance !== undefined
          ? dto.maintenance
          : num(budget.maintenance),
      other: dto.other !== undefined ? dto.other : num(budget.other),
      total: dto.total !== undefined ? dto.total : num(budget.total),
      driverReward:
        dto.driverReward !== undefined
          ? dto.driverReward
          : num(budget.driverReward),
      driverRewardCondition:
        dto.driverRewardCondition !== undefined
          ? dto.driverRewardCondition
          : budget.driverRewardCondition ?? null,
      finalTotal:
        dto.finalTotal !== undefined
          ? dto.finalTotal
          : num(budget.finalTotal),
    };
  }

  /**
   * Persist base + derived values.
   * `explicit` = original request: fields present there are not overwritten by auto-calc.
   */
  private computeFields(
    base: CreateClientBudgetDto | UpdateClientBudgetDto,
    explicit: CreateClientBudgetDto | UpdateClientBudgetDto,
  ) {
    const includeReturn = base.includeReturn ?? false;
    const oneSide = this.toNum(base.oneSideTotalKm);
    const excess = this.toNum(base.allowExcessKm) ?? 0;

    let returnKm = this.toNum(base.returnKm);
    if (
      includeReturn &&
      oneSide != null &&
      explicit.returnKm === undefined
    ) {
      returnKm = oneSide;
    }

    let totalKm = this.toNum(base.totalKm);
    if (explicit.totalKm === undefined && oneSide != null) {
      totalKm = oneSide + excess + (returnKm ?? 0);
    }

    const perLtr = this.toNum(base.perLtrKmAverage);
    let fuelLtr = this.toNum(base.fuelLtr);
    if (
      explicit.fuelLtr === undefined &&
      totalKm != null &&
      perLtr &&
      perLtr > 0
    ) {
      fuelLtr = totalKm / perLtr;
    }

    const foodPerDay = this.toNum(base.foodPerDay);
    const noOfDays = this.toNum(base.noOfDays);
    let totalFoodCash = this.toNum(base.totalFoodCash);
    if (
      explicit.totalFoodCash === undefined &&
      foodPerDay != null &&
      noOfDays != null
    ) {
      totalFoodCash = foodPerDay * noOfDays;
    }

    const tollPer = this.toNum(base.tollTaxPerStation);
    const tollStations = this.toNum(base.totalTollTaxStations);
    let totalTollTax = this.toNum(base.totalTollTax);
    if (
      explicit.totalTollTax === undefined &&
      tollPer != null &&
      tollStations != null
    ) {
      totalTollTax = tollPer * tollStations;
    }

    const expenseParts = [
      this.toNum(base.loadingUnloading),
      totalFoodCash,
      totalTollTax,
      this.toNum(base.policeChallan),
      this.toNum(base.challan),
      this.toNum(base.greasingAirCheckup),
      this.toNum(base.vehicleService),
      this.toNum(base.tyrePunctureEtc),
      this.toNum(base.maintenance),
      this.toNum(base.other),
    ];
    let total = this.toNum(base.total);
    if (explicit.total === undefined) {
      total = expenseParts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
    }

    const driverReward = this.toNum(base.driverReward);
    let finalTotal = this.toNum(base.finalTotal);
    if (explicit.finalTotal === undefined) {
      finalTotal = (total ?? 0) + (driverReward ?? 0);
    }

    return {
      includeReturn,
      oneSideTotalKm: this.formatDecimal(oneSide, 3),
      returnKm: this.formatDecimal(returnKm, 3),
      allowExcessKm: this.formatDecimal(this.toNum(base.allowExcessKm), 3),
      totalKm: this.formatDecimal(totalKm, 3),
      perLtrKmAverage: this.formatDecimal(perLtr, 3),
      fuelLtr: this.formatDecimal(fuelLtr, 3),
      description: this.nullableTrim(base.description),
      loadingUnloading: this.formatDecimal(
        this.toNum(base.loadingUnloading),
        2,
      ),
      foodPerDay: this.formatDecimal(foodPerDay, 2),
      noOfDays: this.formatDecimal(noOfDays, 2),
      totalFoodCash: this.formatDecimal(totalFoodCash, 2),
      tollTaxPerStation: this.formatDecimal(tollPer, 2),
      totalTollTaxStations: this.formatDecimal(tollStations, 2),
      totalTollTax: this.formatDecimal(totalTollTax, 2),
      policeChallan: this.formatDecimal(this.toNum(base.policeChallan), 2),
      challan: this.formatDecimal(this.toNum(base.challan), 2),
      greasingAirCheckup: this.formatDecimal(
        this.toNum(base.greasingAirCheckup),
        2,
      ),
      vehicleService: this.formatDecimal(this.toNum(base.vehicleService), 2),
      tyrePunctureEtc: this.formatDecimal(this.toNum(base.tyrePunctureEtc), 2),
      maintenance: this.formatDecimal(this.toNum(base.maintenance), 2),
      other: this.formatDecimal(this.toNum(base.other), 2),
      total: this.formatDecimal(total, 2),
      driverReward: this.formatDecimal(driverReward, 2),
      driverRewardCondition: this.nullableTrim(base.driverRewardCondition),
      finalTotal: this.formatDecimal(finalTotal, 2),
    };
  }

  private toNum(value?: number | string | null): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private formatDecimal(
    value: number | null | undefined,
    scale: number,
  ): string | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value.toFixed(scale);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(budget: ClientBudget) {
    return {
      id: budget.id,
      clientId: budget.clientId,
      vehicleTypeId: budget.vehicleTypeId ?? null,
      vehicleSizeId: budget.vehicleSizeId ?? null,
      vehicleCapacityId: budget.vehicleCapacityId ?? null,
      routes: budget.routes ?? null,
      oneSideTotalKm: budget.oneSideTotalKm ?? null,
      returnKm: budget.returnKm ?? null,
      includeReturn: budget.includeReturn ?? false,
      allowExcessKm: budget.allowExcessKm ?? null,
      totalKm: budget.totalKm ?? null,
      perLtrKmAverage: budget.perLtrKmAverage ?? null,
      fuelLtr: budget.fuelLtr ?? null,
      description: budget.description ?? null,
      loadingUnloading: budget.loadingUnloading ?? null,
      foodPerDay: budget.foodPerDay ?? null,
      noOfDays: budget.noOfDays ?? null,
      totalFoodCash: budget.totalFoodCash ?? null,
      tollTaxPerStation: budget.tollTaxPerStation ?? null,
      totalTollTaxStations: budget.totalTollTaxStations ?? null,
      totalTollTax: budget.totalTollTax ?? null,
      policeChallan: budget.policeChallan ?? null,
      challan: budget.challan ?? null,
      greasingAirCheckup: budget.greasingAirCheckup ?? null,
      vehicleService: budget.vehicleService ?? null,
      tyrePunctureEtc: budget.tyrePunctureEtc ?? null,
      maintenance: budget.maintenance ?? null,
      other: budget.other ?? null,
      total: budget.total ?? null,
      driverReward: budget.driverReward ?? null,
      driverRewardCondition: budget.driverRewardCondition ?? null,
      finalTotal: budget.finalTotal ?? null,
      client: budget.client
        ? {
            id: budget.client.id,
            companyName: budget.client.companyName,
          }
        : null,
      vehicleType: budget.vehicleType
        ? {
            id: budget.vehicleType.id,
            name: budget.vehicleType.name,
            measurement: budget.vehicleType.measurement,
          }
        : null,
      vehicleSize: budget.vehicleSize
        ? { id: budget.vehicleSize.id, name: budget.vehicleSize.name }
        : null,
      vehicleCapacity: budget.vehicleCapacity
        ? {
            id: budget.vehicleCapacity.id,
            name: budget.vehicleCapacity.name,
          }
        : null,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    };
  }
}
