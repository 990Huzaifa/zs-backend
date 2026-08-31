import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeTripExpenseStatusDto,
  ChangeTripLoadStatusDto,
  ChangeTripStatusDto,
  CreateTripAssetExpenseDto,
  CreateTripDto,
  CreateTripFuelExpenseDto,
  CreateTripLoadDto,
  CreateTripOfficeExpenseDto,
  CreateTripPumpExpenseDto,
  TripListQueryDto,
  UpdateTripDto,
  UpdateTripLoadDto,
} from '../auth/dto/trip.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  nextSerialCode,
  TRIP_CODE_PREFIX,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Bilty } from '../database/entities/bilty.entity';
import { ChartOfAccount, ChartOfAccountKind } from '../database/entities/chart-of-account.entity';
import { Client } from '../database/entities/client.entity';
import {
  Trip,
  TripDowncountryLoad,
  TripExpenseStatus,
  TripFuelExpense,
  TripLoadStatus,
  TripMtagExpense,
  TripOfficeExpense,
  TripOtherExpense,
  TripPumpExpense,
  TripStatus,
  TripUpcountryLoad,
} from '../database/entities/trip.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import {
  Vendor,
  VendorProduct,
} from '../database/entities/vendor.entity';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { TripDriversService } from './trip-drivers.service';

type ExpenseKind = 'office' | 'pump' | 'fuel' | 'mtag' | 'other';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripUpcountryLoad)
    private readonly upcountryRepo: Repository<TripUpcountryLoad>,
    @InjectRepository(TripDowncountryLoad)
    private readonly downcountryRepo: Repository<TripDowncountryLoad>,
    @InjectRepository(TripOfficeExpense)
    private readonly officeExpenseRepo: Repository<TripOfficeExpense>,
    @InjectRepository(TripPumpExpense)
    private readonly pumpExpenseRepo: Repository<TripPumpExpense>,
    @InjectRepository(TripFuelExpense)
    private readonly fuelExpenseRepo: Repository<TripFuelExpense>,
    @InjectRepository(TripMtagExpense)
    private readonly mtagExpenseRepo: Repository<TripMtagExpense>,
    @InjectRepository(TripOtherExpense)
    private readonly otherExpenseRepo: Repository<TripOtherExpense>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(ChartOfAccount)
    private readonly accountRepo: Repository<ChartOfAccount>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorProduct)
    private readonly vendorProductRepo: Repository<VendorProduct>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly tripDriversService: TripDriversService,
  ) {}

  async create(dto: CreateTripDto, activity?: ActivityActorContext) {
    await this.ensureVehicle(dto.vehicleId);
    await this.tripDriversService.ensureDrivers(dto.driverIds);

    const upcountryLoads = dto.upcountryLoads ?? [];
    const downcountryLoads = dto.downcountryLoads ?? [];
    const officeExpenses = dto.officeExpenses ?? [];
    const pumpExpenses = dto.pumpExpenses ?? [];
    const fuelExpenses = dto.fuelExpenses ?? [];
    const mtagExpenses = dto.mtagExpenses ?? [];
    const otherExpenses = dto.otherExpenses ?? [];

    await this.validateLoads(upcountryLoads);
    await this.validateLoads(downcountryLoads);
    await this.validateOfficeExpenses(officeExpenses);
    await this.validatePumpExpenses(pumpExpenses);
    await this.validateFuelExpenses(fuelExpenses);
    await this.validateAssetExpenses(mtagExpenses);
    await this.validateAssetExpenses(otherExpenses);

    const tripCode = await this.generateUniqueCode();

    const savedId = await this.dataSource.transaction(async (manager) => {
      const trip = await manager.save(
        manager.create(Trip, {
          tripCode,
          vehicleId: dto.vehicleId,
          tripDate: dto.tripDate.slice(0, 10) as unknown as Date,
          odoReading: this.nullableTrim(dto.odoReading),
          status: dto.status ?? TripStatus.PENDING,
        }),
      );

      await this.tripDriversService.replaceDrivers(
        manager,
        trip.id,
        dto.driverIds,
      );
      await this.replaceUpcountryLoads(manager, trip.id, upcountryLoads);
      await this.replaceDowncountryLoads(manager, trip.id, downcountryLoads);
      await this.replaceOfficeExpenses(manager, trip.id, officeExpenses);
      await this.replacePumpExpenses(manager, trip.id, pumpExpenses);
      await this.replaceFuelExpenses(manager, trip.id, fuelExpenses);
      await this.replaceMtagExpenses(manager, trip.id, mtagExpenses);
      await this.replaceOtherExpenses(manager, trip.id, otherExpenses);

      return trip.id;
    });

    const result = await this.findOne(savedId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: savedId,
        record: tripCode,
        description: `Created trip ${tripCode}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query: TripListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.baseListQuery(query)
      .orderBy('trip.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const data = await qb.getMany();

    const countRaw = await this.applyListFilters(
      this.tripRepo.createQueryBuilder('trip'),
      query,
    )
      .select('COUNT(DISTINCT trip.id)', 'cnt')
      .getRawOne<{ cnt: string }>();
    const total = Number(countRaw?.cnt ?? 0);

    const summary = await this.buildSummary(query);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary,
    };
  }

  async findOne(id: string) {
    return this.findByIdOrFail(id);
  }

  async update(
    id: string,
    dto: UpdateTripDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.findByIdOrFail(id);

    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      trip.vehicleId = dto.vehicleId;
    }
    if (dto.driverIds !== undefined) {
      await this.tripDriversService.ensureDrivers(dto.driverIds);
    }
    if (dto.tripDate !== undefined) {
      trip.tripDate = dto.tripDate.slice(0, 10) as unknown as Date;
    }
    if (dto.odoReading !== undefined) {
      trip.odoReading = this.nullableTrim(dto.odoReading);
    }

    if (dto.upcountryLoads !== undefined) {
      await this.validateLoads(dto.upcountryLoads);
    }
    if (dto.downcountryLoads !== undefined) {
      await this.validateLoads(dto.downcountryLoads);
    }
    if (dto.officeExpenses !== undefined) {
      await this.validateOfficeExpenses(dto.officeExpenses);
    }
    if (dto.pumpExpenses !== undefined) {
      await this.validatePumpExpenses(dto.pumpExpenses);
    }
    if (dto.fuelExpenses !== undefined) {
      await this.validateFuelExpenses(dto.fuelExpenses);
    }
    if (dto.mtagExpenses !== undefined) {
      await this.validateAssetExpenses(dto.mtagExpenses);
    }
    if (dto.otherExpenses !== undefined) {
      await this.validateAssetExpenses(dto.otherExpenses);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(trip);

      if (dto.driverIds !== undefined) {
        await this.tripDriversService.replaceDrivers(
          manager,
          id,
          dto.driverIds,
        );
      }
      if (dto.upcountryLoads !== undefined) {
        await this.replaceUpcountryLoads(manager, id, dto.upcountryLoads);
      }
      if (dto.downcountryLoads !== undefined) {
        await this.replaceDowncountryLoads(manager, id, dto.downcountryLoads);
      }
      if (dto.officeExpenses !== undefined) {
        await this.replaceOfficeExpenses(manager, id, dto.officeExpenses);
      }
      if (dto.pumpExpenses !== undefined) {
        await this.replacePumpExpenses(manager, id, dto.pumpExpenses);
      }
      if (dto.fuelExpenses !== undefined) {
        await this.replaceFuelExpenses(manager, id, dto.fuelExpenses);
      }
      if (dto.mtagExpenses !== undefined) {
        await this.replaceMtagExpenses(manager, id, dto.mtagExpenses);
      }
      if (dto.otherExpenses !== undefined) {
        await this.replaceOtherExpenses(manager, id, dto.otherExpenses);
      }
    });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: id,
        record: result.tripCode,
        description: `Updated trip ${result.tripCode}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeTripStatusDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.findByIdOrFail(id);
    trip.status = dto.status;
    await this.tripRepo.save(trip);

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: id,
        record: result.tripCode,
        description: `Changed trip ${result.tripCode} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );
    return result;
  }

  async changeUpcountryLoadStatus(
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    return this.changeLoadStatus(
      'upcountry',
      tripId,
      loadId,
      dto,
      activity,
    );
  }

  async changeDowncountryLoadStatus(
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    return this.changeLoadStatus(
      'downcountry',
      tripId,
      loadId,
      dto,
      activity,
    );
  }

  async updateUpcountryLoad(
    tripId: string,
    loadId: string,
    dto: UpdateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateLoad('upcountry', tripId, loadId, dto, activity);
  }

  async updateDowncountryLoad(
    tripId: string,
    loadId: string,
    dto: UpdateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateLoad('downcountry', tripId, loadId, dto, activity);
  }

  async addUpcountryLoad(
    tripId: string,
    dto: CreateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    return this.addLoad('upcountry', tripId, dto, activity);
  }

  async addDowncountryLoad(
    tripId: string,
    dto: CreateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    return this.addLoad('downcountry', tripId, dto, activity);
  }

  async changeExpenseStatus(
    tripId: string,
    kind: ExpenseKind,
    expenseId: string,
    dto: ChangeTripExpenseStatusDto,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(tripId);

    const updated = await this.updateExpenseStatus(
      kind,
      tripId,
      expenseId,
      dto.status,
    );
    if (!updated) {
      throw new NotFoundException(`${kind} expense not found`);
    }

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripExpense',
        entityId: expenseId,
        record: result.tripCode,
        description: `Changed trip ${result.tripCode} ${kind} expense status to ${dto.status}`,
        metadata: { kind, expenseId, status: dto.status },
      },
      activity,
    );
    return result;
  }

  private async updateExpenseStatus(
    kind: ExpenseKind,
    tripId: string,
    expenseId: string,
    status: TripExpenseStatus,
  ): Promise<boolean> {
    switch (kind) {
      case 'office': {
        const row = await this.officeExpenseRepo.findOne({
          where: { id: expenseId, tripId },
        });
        if (!row) return false;
        row.status = status;
        await this.officeExpenseRepo.save(row);
        return true;
      }
      case 'pump': {
        const row = await this.pumpExpenseRepo.findOne({
          where: { id: expenseId, tripId },
        });
        if (!row) return false;
        row.status = status;
        await this.pumpExpenseRepo.save(row);
        return true;
      }
      case 'fuel': {
        const row = await this.fuelExpenseRepo.findOne({
          where: { id: expenseId, tripId },
        });
        if (!row) return false;
        row.status = status;
        await this.fuelExpenseRepo.save(row);
        return true;
      }
      case 'mtag': {
        const row = await this.mtagExpenseRepo.findOne({
          where: { id: expenseId, tripId },
        });
        if (!row) return false;
        row.status = status;
        await this.mtagExpenseRepo.save(row);
        return true;
      }
      case 'other': {
        const row = await this.otherExpenseRepo.findOne({
          where: { id: expenseId, tripId },
        });
        if (!row) return false;
        row.status = status;
        await this.otherExpenseRepo.save(row);
        return true;
      }
    }
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const trip = await this.findByIdOrFail(id);
    await this.tripRepo.remove(trip);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: id,
        record: trip.tripCode,
        description: `Deleted trip ${trip.tripCode}`,
      },
      activity,
    );
    return { message: 'Trip deleted' };
  }

  private async changeLoadStatus(
    direction: 'upcountry' | 'downcountry',
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(tripId);

    const repo =
      direction === 'upcountry' ? this.upcountryRepo : this.downcountryRepo;
    const load = await repo.findOne({ where: { id: loadId, tripId } });
    if (!load) {
      throw new NotFoundException(`${direction} load not found`);
    }

    load.status = dto.status;
    await repo.save(load);

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripLoad',
        entityId: loadId,
        record: result.tripCode,
        description: `Changed trip ${result.tripCode} ${direction} load status to ${dto.status}`,
        metadata: { direction, loadId, status: dto.status },
      },
      activity,
    );
    return result;
  }

  private async updateLoad(
    direction: 'upcountry' | 'downcountry',
    tripId: string,
    loadId: string,
    dto: UpdateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.findByIdOrFail(tripId);
    this.ensureTripAllowsLoadChanges(trip, direction);

    const repo =
      direction === 'upcountry' ? this.upcountryRepo : this.downcountryRepo;
    const load = await repo.findOne({ where: { id: loadId, tripId } });
    if (!load) {
      throw new NotFoundException(`${direction} load not found`);
    }

    if (load.status === TripLoadStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot edit ${direction} load when load status is COMPLETED`,
      );
    }

    if (dto.clientId !== undefined || dto.biltyId !== undefined) {
      await this.validateLoads([
        {
          clientId: dto.clientId ?? load.clientId,
          biltyId: dto.biltyId ?? load.biltyId,
        },
      ]);
    }

    if (dto.clientId !== undefined) load.clientId = dto.clientId;
    if (dto.biltyId !== undefined) load.biltyId = dto.biltyId;
    if (dto.toDetails !== undefined) {
      load.toDetails = this.nullableTrim(dto.toDetails);
    }
    if (dto.deliveryChallanNumber !== undefined) {
      load.deliveryChallanNumber = this.nullableTrim(dto.deliveryChallanNumber);
    }
    if (dto.loadingDate !== undefined) {
      load.loadingDate = this.toOptionalDateOnly(dto.loadingDate);
    }
    if (dto.productDescription !== undefined) {
      load.productDescription = this.nullableTrim(dto.productDescription);
    }
    if (dto.address !== undefined) {
      load.address = this.nullableTrim(dto.address);
    }
    if (dto.netWeight !== undefined) {
      load.netWeight =
        dto.netWeight === null ? null : this.formatQty(dto.netWeight);
    }
    if (dto.cartonCount !== undefined) {
      load.cartonCount = dto.cartonCount;
    }
    if (dto.status !== undefined) {
      load.status = dto.status;
    }

    await repo.save(load);

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripLoad',
        entityId: loadId,
        record: result.tripCode,
        description: `Updated trip ${result.tripCode} ${direction} load`,
        metadata: { direction, loadId },
      },
      activity,
    );
    return result;
  }

  private async addLoad(
    direction: 'upcountry' | 'downcountry',
    tripId: string,
    dto: CreateTripLoadDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.findByIdOrFail(tripId);
    this.ensureTripAllowsLoadChanges(trip, direction);
    await this.validateLoads([dto]);

    const repo =
      direction === 'upcountry' ? this.upcountryRepo : this.downcountryRepo;
    const saved = await repo.save(repo.create(this.mapLoad(tripId, dto)));

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripLoad',
        entityId: saved.id,
        record: result.tripCode,
        description: `Added ${direction} load to trip ${result.tripCode}`,
        metadata: { direction, loadId: saved.id },
      },
      activity,
    );
    return result;
  }

  private ensureTripAllowsLoadChanges(
    trip: Trip,
    direction: 'upcountry' | 'downcountry',
  ) {
    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot change ${direction} loads when trip status is ${trip.status}`,
      );
    }
  }

  private baseListQuery(
    query: TripListQueryDto,
  ): SelectQueryBuilder<Trip> {
    const qb = this.tripRepo
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.drivers', 'tripDriver')
      .leftJoinAndSelect('tripDriver.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser');
    return this.applyListFilters(qb, query);
  }

  private applyListFilters(
    qb: SelectQueryBuilder<Trip>,
    query: TripListQueryDto,
  ): SelectQueryBuilder<Trip> {
    const needsVehicleJoin =
      !!query.search?.trim() &&
      !qb.expressionMap.joinAttributes.some((j) => j.alias?.name === 'vehicle');
    const needsDriverUserJoin =
      (!!query.search?.trim() || !!query.driverId) &&
      !qb.expressionMap.joinAttributes.some(
        (j) => j.alias?.name === 'driverUser',
      );

    if (needsVehicleJoin) {
      qb.leftJoin('trip.vehicle', 'vehicle');
    }
    if (needsDriverUserJoin) {
      qb
        .leftJoin('trip.drivers', 'tripDriver')
        .leftJoin('tripDriver.driver', 'driver')
        .leftJoin('driver.user', 'driverUser');
    }

    if (query.status) {
      qb.andWhere('trip.status = :status', { status: query.status });
    }
    if (query.vehicleId) {
      qb.andWhere('trip.vehicleId = :vehicleId', {
        vehicleId: query.vehicleId,
      });
    }
    if (query.driverId) {
      qb.andWhere('tripDriver.driverId = :driverId', {
        driverId: query.driverId,
      });
    }
    if (query.tripDateFrom) {
      qb.andWhere('trip.tripDate >= :tripDateFrom', {
        tripDateFrom: query.tripDateFrom.slice(0, 10),
      });
    }
    if (query.tripDateTo) {
      qb.andWhere('trip.tripDate <= :tripDateTo', {
        tripDateTo: query.tripDateTo.slice(0, 10),
      });
    }
    if (query.clientId) {
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."tripId" = trip.id AND ul."clientId" = :clientId
          )
          OR EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."tripId" = trip.id AND dl."clientId" = :clientId
          )
        )`,
        { clientId: query.clientId },
      );
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          trip.tripCode ILIKE :search
          OR trip.odoReading ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR driverUser.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private async buildSummary(query: TripListQueryDto) {
    const filteredIdsQb = this.applyListFilters(
      this.tripRepo.createQueryBuilder('trip'),
      query,
    )
      .select('trip.id', 'id')
      .distinct(true);
    const filteredRows = await filteredIdsQb.getRawMany<{ id: string }>();
    const tripIds = filteredRows.map((r) => r.id);

    const byStatus: Record<TripStatus, number> = {
      [TripStatus.PENDING]: 0,
      [TripStatus.STARTED]: 0,
      [TripStatus.COMPLETED]: 0,
      [TripStatus.CANCELLED]: 0,
    };

    if (!tripIds.length) {
      return {
        totalTrips: 0,
        byStatus,
        totalUpcountryLoads: 0,
        totalDowncountryLoads: 0,
        expenses: {
          office: '0.00',
          pump: '0.00',
          fuel: '0.00',
          mtag: '0.00',
          other: '0.00',
          total: '0.00',
        },
      };
    }

    const statusRows = await this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('trip.id IN (:...tripIds)', { tripIds })
      .groupBy('trip.status')
      .getRawMany<{ status: TripStatus; count: string }>();

    for (const row of statusRows) {
      byStatus[row.status] = Number(row.count) || 0;
    }

    const totalUpcountryLoads = await this.upcountryRepo
      .createQueryBuilder('load')
      .where('load.tripId IN (:...tripIds)', { tripIds })
      .getCount();

    const totalDowncountryLoads = await this.downcountryRepo
      .createQueryBuilder('load')
      .where('load.tripId IN (:...tripIds)', { tripIds })
      .getCount();

    const [office, pump, fuel, mtag, other] = await Promise.all([
      this.sumExpenseAmount(this.officeExpenseRepo, tripIds),
      this.sumExpenseAmount(this.pumpExpenseRepo, tripIds),
      this.sumExpenseAmount(this.fuelExpenseRepo, tripIds),
      this.sumExpenseAmount(this.mtagExpenseRepo, tripIds),
      this.sumExpenseAmount(this.otherExpenseRepo, tripIds),
    ]);

    const total =
      Number(office) +
      Number(pump) +
      Number(fuel) +
      Number(mtag) +
      Number(other);

    return {
      totalTrips: tripIds.length,
      byStatus,
      totalUpcountryLoads,
      totalDowncountryLoads,
      expenses: {
        office: this.formatMoney(office),
        pump: this.formatMoney(pump),
        fuel: this.formatMoney(fuel),
        mtag: this.formatMoney(mtag),
        other: this.formatMoney(other),
        total: this.formatMoney(total),
      },
    };
  }

  private async sumExpenseAmount(
    repo:
      | Repository<TripOfficeExpense>
      | Repository<TripPumpExpense>
      | Repository<TripFuelExpense>
      | Repository<TripMtagExpense>
      | Repository<TripOtherExpense>,
    tripIds: string[],
  ): Promise<number> {
    const raw = await repo
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.tripId IN (:...tripIds)', { tripIds })
      .andWhere('expense.status != :cancelled', {
        cancelled: TripExpenseStatus.CANCELLED,
      })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  private async findByIdOrFail(id: string) {
    const trip = await this.tripRepo.findOne({
      where: { id },
      relations: {
        vehicle: true,
        drivers: { driver: { user: true } },
        upcountryLoads: { client: true, bilty: true },
        downcountryLoads: { client: true, bilty: true },
        officeExpenses: { assetAccount: true },
        pumpExpenses: { vendor: true, vendorAccount: true },
        fuelExpenses: {
          vendor: true,
          vendorAccount: true,
          vendorProduct: true,
        },
        mtagExpenses: { assetAccount: true },
        otherExpenses: { assetAccount: true },
      },
      order: {
        drivers: { createdAt: 'ASC' },
        upcountryLoads: { createdAt: 'ASC' },
        downcountryLoads: { createdAt: 'ASC' },
        officeExpenses: { createdAt: 'ASC' },
        pumpExpenses: { createdAt: 'ASC' },
        fuelExpenses: { createdAt: 'ASC' },
        mtagExpenses: { createdAt: 'ASC' },
        otherExpenses: { createdAt: 'ASC' },
      },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  private async ensureVehicle(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) throw new BadRequestException('Vehicle not found');
  }

  private async validateLoads(loads: CreateTripLoadDto[]) {
    for (const item of loads) {
      const client = await this.clientRepo.exist({
        where: { id: item.clientId },
      });
      if (!client) {
        throw new BadRequestException(`Client not found: ${item.clientId}`);
      }

      const bilty = await this.biltyRepo.exist({ where: { id: item.biltyId } });
      if (!bilty) {
        throw new BadRequestException(`Bilty not found: ${item.biltyId}`);
      }
    }
  }

  private async validateOfficeExpenses(items: CreateTripOfficeExpenseDto[]) {
    for (const item of items) {
      await this.ensureAccount(item.assetAccountId);
    }
  }

  private async validatePumpExpenses(items: CreateTripPumpExpenseDto[]) {
    for (const item of items) {
      await this.ensureVendor(item.vendorId);
    }
  }

  private async validateFuelExpenses(items: CreateTripFuelExpenseDto[]) {
    for (const item of items) {
      await this.ensureVendor(item.vendorId);
      const product = await this.vendorProductRepo.exist({
        where: { id: item.vendorProductId },
      });
      if (!product) {
        throw new BadRequestException(
          `Vendor product not found: ${item.vendorProductId}`,
        );
      }
    }
  }

  private async validateAssetExpenses(items: CreateTripAssetExpenseDto[]) {
    for (const item of items) {
      await this.ensureAccount(item.assetAccountId);
    }
  }

  private async ensureVendor(vendorId: string) {
    const exists = await this.vendorRepo.exist({ where: { id: vendorId } });
    if (!exists) {
      throw new BadRequestException(`Vendor not found: ${vendorId}`);
    }
  }

  /** Resolve vendor's linked PARTY_PAYABLE leaf under Vendor Payables. */
  private async resolveVendorAccountId(vendorId: string): Promise<string> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) {
      throw new BadRequestException(`Vendor not found: ${vendorId}`);
    }

    const displayName =
      vendor.vendorName?.trim() || vendor.ownerName.trim();

    const account = await this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.VENDOR_PAYABLES,
      displayName,
      displayName,
      ChartOfAccountKind.PARTY_PAYABLE,
    );

    return account.id;
  }

  private async ensureAccount(accountId: string) {
    const exists = await this.accountRepo.exist({ where: { id: accountId } });
    if (!exists) {
      throw new BadRequestException(
        `Chart of account not found: ${accountId}`,
      );
    }
  }

  private async replaceUpcountryLoads(
    manager: EntityManager,
    tripId: string,
    loads: CreateTripLoadDto[],
  ) {
    await manager.delete(TripUpcountryLoad, { tripId });
    if (!loads.length) return;
    await manager.save(
      loads.map((item) =>
        manager.create(TripUpcountryLoad, this.mapLoad(tripId, item)),
      ),
    );
  }

  private async replaceDowncountryLoads(
    manager: EntityManager,
    tripId: string,
    loads: CreateTripLoadDto[],
  ) {
    await manager.delete(TripDowncountryLoad, { tripId });
    if (!loads.length) return;
    await manager.save(
      loads.map((item) =>
        manager.create(TripDowncountryLoad, this.mapLoad(tripId, item)),
      ),
    );
  }

  private mapLoad(tripId: string, item: CreateTripLoadDto) {
    return {
      tripId,
      clientId: item.clientId,
      biltyId: item.biltyId,
      toDetails: this.nullableTrim(item.toDetails),
      deliveryChallanNumber: this.nullableTrim(item.deliveryChallanNumber),
      loadingDate: this.toOptionalDateOnly(item.loadingDate),
      productDescription: this.nullableTrim(item.productDescription),
      address: this.nullableTrim(item.address),
      netWeight:
        item.netWeight === undefined || item.netWeight === null
          ? null
          : this.formatQty(item.netWeight),
      cartonCount:
        item.cartonCount === undefined || item.cartonCount === null
          ? null
          : item.cartonCount,
      status: item.status ?? TripLoadStatus.PENDING,
    };
  }

  private async replaceOfficeExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripOfficeExpenseDto[],
  ) {
    await manager.delete(TripOfficeExpense, { tripId });
    if (!items.length) return;
    await manager.save(
      items.map((item) =>
        manager.create(TripOfficeExpense, {
          tripId,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      ),
    );
  }

  private async replacePumpExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripPumpExpenseDto[],
  ) {
    await manager.delete(TripPumpExpense, { tripId });
    if (!items.length) return;

    const rows: TripPumpExpense[] = [];
    for (const item of items) {
      const vendorAccountId = await this.resolveVendorAccountId(item.vendorId);
      rows.push(
        manager.create(TripPumpExpense, {
          tripId,
          vendorId: item.vendorId,
          vendorAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      );
    }
    await manager.save(rows);
  }

  private async replaceFuelExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripFuelExpenseDto[],
  ) {
    await manager.delete(TripFuelExpense, { tripId });
    if (!items.length) return;

    const rows: TripFuelExpense[] = [];
    for (const item of items) {
      const vendorAccountId = await this.resolveVendorAccountId(item.vendorId);
      rows.push(
        manager.create(TripFuelExpense, {
          tripId,
          vendorId: item.vendorId,
          vendorAccountId,
          vendorProductId: item.vendorProductId,
          rate: this.formatMoney(item.rate),
          quantity: this.formatQty(item.quantity),
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      );
    }
    await manager.save(rows);
  }

  private async replaceMtagExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripAssetExpenseDto[],
  ) {
    await manager.delete(TripMtagExpense, { tripId });
    if (!items.length) return;
    await manager.save(
      items.map((item) =>
        manager.create(TripMtagExpense, {
          tripId,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      ),
    );
  }

  private async replaceOtherExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripAssetExpenseDto[],
  ) {
    await manager.delete(TripOtherExpense, { tripId });
    if (!items.length) return;
    await manager.save(
      items.map((item) =>
        manager.create(TripOtherExpense, {
          tripId,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      ),
    );
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.tripRepo,
        TRIP_CODE_PREFIX,
        'tripCode',
        6,
        attempt,
      );
      const existing = await this.tripRepo.findOne({
        where: { tripCode: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique trip code');
  }

  private formatMoney(value: number): string {
    return Number(value || 0).toFixed(2);
  }

  private formatQty(value: number): string {
    return Number(value || 0).toFixed(3);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toOptionalDateOnly(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return value.slice(0, 10) as unknown as Date;
  }
}
