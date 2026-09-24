import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeTripDocStatusDto,
  ChangeTripExpenseStatusDto,
  ChangeTripLoadStatusDto,
  ChangeTripStatusDto,
  CreateTripAssetExpenseDto,
  CreateTripDto,
  CreateTripLoadDto,
  CreateTripOfficeExpenseDto,
  CreateTripPumpExpenseDto,
  TripListQueryDto,
  UpdateTripAssetExpenseDto,
  UpdateTripDto,
  UpdateTripLoadDto,
  UpdateTripOfficeExpenseDto,
  UpdateTripPumpExpenseDto,
} from '../auth/dto/trip.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import {
  nextSerialCode,
  TRIP_CODE_PREFIX,
  TRIP_MTAG_EXPENSE_VOUCHER_PREFIX,
  TRIP_OFFICE_EXPENSE_VOUCHER_PREFIX,
  TRIP_OTHER_EXPENSE_VOUCHER_PREFIX,
  TRIP_PUMP_EXPENSE_VOUCHER_PREFIX,
} from '../common/utils/serial-code.util';
import { userHasPermission } from '../common/utils/user-permissions.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Bilty } from '../database/entities/bilty.entity';
import { ChartOfAccount, ChartOfAccountKind } from '../database/entities/chart-of-account.entity';
import { Client, ClientRate } from '../database/entities/client.entity';
import {
  Trip,
  TripDocStatus,
  TripDocument,
  TripDowncountryLoad,
  TripExpenseStatus,
  TripLoadStatus,
  TripMtagExpense,
  TripOfficeExpense,
  TripOtherExpense,
  TripPumpExpense,
  TripStatus,
  TripUpcountryLoad,
} from '../database/entities/trip.entity';
import { AccountTransactionReferenceType } from '../database/entities/transaction.entity';
import { User } from '../database/entities/user.entity';
import {
  Vehicle,
  VehicleTypeMeasurement,
} from '../database/entities/vehicle.entity';
import { Vendor, VendorProduct } from '../database/entities/vendor.entity';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { TripDriversService } from './trip-drivers.service';
import { TransactionsService } from './transactions.service';

type ExpenseKind = 'office' | 'pump' | 'mtag' | 'other';

const PAID_EDIT_PERMISSION: Record<ExpenseKind, string> = {
  office: 'EDIT_PAID_TRIP_OFFICE_EXPENSE',
  pump: 'EDIT_PAID_TRIP_PUMP_EXPENSE',
  mtag: 'EDIT_PAID_TRIP_MTAG_EXPENSE',
  other: 'EDIT_PAID_TRIP_OTHER_EXPENSE',
};

type ExpenseLedgerContext = {
  chartOfAccountId: string;
  referenceType: AccountTransactionReferenceType;
  amount: number;
  expenseDate: Date;
  description: string | null | undefined;
  status: TripExpenseStatus;
  save: (manager: EntityManager, status: TripExpenseStatus) => Promise<void>;
};

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
    @InjectRepository(TripMtagExpense)
    private readonly mtagExpenseRepo: Repository<TripMtagExpense>,
    @InjectRepository(TripOtherExpense)
    private readonly otherExpenseRepo: Repository<TripOtherExpense>,
    @InjectRepository(TripDocument)
    private readonly tripDocumentRepo: Repository<TripDocument>,
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
    @InjectRepository(ClientRate)
    private readonly clientRateRepo: Repository<ClientRate>,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly activitiesService: ActivitiesService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly tripDriversService: TripDriversService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(dto: CreateTripDto, activity?: ActivityActorContext) {
    await this.ensureVehicle(dto.vehicleId);
    await this.tripDriversService.ensureDrivers(dto.driverIds);

    const upcountryLoads = dto.upcountryLoads ?? [];
    const downcountryLoads = dto.downcountryLoads ?? [];
    const officeExpenses = dto.officeExpenses ?? [];
    const pumpExpenses = dto.pumpExpenses ?? [];
    const mtagExpenses = dto.mtagExpenses ?? [];
    const otherExpenses = dto.otherExpenses ?? [];

    await this.validateLoads(upcountryLoads);
    await this.validateLoads(downcountryLoads);
    await this.validateOfficeExpenses(officeExpenses);
    await this.validatePumpExpenses(pumpExpenses);
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
          docStatus: dto.docStatus ?? TripDocStatus.PENDING,
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
    await this.attachLoadsForList(data);

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

  /** Trip list for forms — full trip + load/driver/vehicle relations, expense total only. */
  async listUtility(
    opts: {
      clientId?: string;
      tripStatus?: TripStatus;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const qb = this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.id', 'id')
      .orderBy('trip.tripDate', 'DESC')
      .addOrderBy('trip.createdAt', 'DESC');

    if (opts.tripStatus) {
      qb.andWhere('trip.status = :tripStatus', { tripStatus: opts.tripStatus });
    }

    if (opts.startDate) {
      qb.andWhere('trip.tripDate >= :startDate', {
        startDate: opts.startDate.slice(0, 10),
      });
    }

    if (opts.endDate) {
      qb.andWhere('trip.tripDate <= :endDate', {
        endDate: opts.endDate.slice(0, 10),
      });
    }

    if (opts.clientId) {
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
        { clientId: opts.clientId },
      );
    }

    const idRows = await qb.getRawMany<{ id: string }>();
    const ids = idRows.map((row) => row.id);
    if (!ids.length) {
      return { data: [] };
    }

    const [trips, totalsByTripId] = await Promise.all([
      this.tripRepo.find({
        where: { id: In(ids) },
        relations: this.utilityTripRelations(),
        order: this.utilityTripRelationOrder(),
      }),
      this.sumExpenseTotalsByTripIds(ids),
    ]);

    const freightByTripId = opts.clientId
      ? await this.resolveFreightAmountsByTrip(opts.clientId, trips)
      : new Map<string, string | null>();

    const byId = new Map(trips.map((trip) => [trip.id, trip]));
    return {
      data: ids
        .map((id) => byId.get(id))
        .filter((trip): trip is Trip => !!trip)
        .map((trip) => {
          const {
            officeExpenses,
            pumpExpenses,
            mtagExpenses,
            otherExpenses,
            ...rest
          } = trip;
          void officeExpenses;
          void pumpExpenses;
          void mtagExpenses;
          void otherExpenses;

          this.sortBiltyLoadSections(rest.upcountryLoads);
          this.sortBiltyLoadSections(rest.downcountryLoads);

          return {
            ...rest,
            totalExpenseAmount: this.formatMoney(
              totalsByTripId.get(trip.id) ?? 0,
            ),
            freightAmount: freightByTripId.get(trip.id) ?? null,
          };
        }),
    };
  }

  async findOne(id: string): Promise<Trip> {
    return this.withDocumentUrls(await this.findByIdOrFail(id));
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
    if (dto.docStatus !== undefined) {
      trip.docStatus = dto.docStatus;
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

  async uploadDocuments(
    id: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one document file is required');
    }

    const exists = await this.tripRepo.exist({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Trip not found');
    }

    const docs: TripDocument[] = [];
    for (const file of files) {
      if (!file?.buffer?.length) {
        throw new BadRequestException(
          `Invalid or empty file: ${file?.originalname ?? 'unknown'}`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `trips/${id}/documents/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      docs.push(
        this.tripDocumentRepo.create({
          tripId: id,
          name: file.originalname?.trim() || null,
          file: key,
        }),
      );
    }

    await this.tripDocumentRepo.save(docs);
    await this.tripRepo.update(id, { docStatus: TripDocStatus.RECEIVED });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: id,
        record: result.tripCode,
        description: `Uploaded ${files.length} document(s) and set trip ${result.tripCode} doc status to ${TripDocStatus.RECEIVED}`,
        metadata: {
          docStatus: TripDocStatus.RECEIVED,
          uploadedCount: files.length,
        },
      },
      activity,
    );
    return result;
  }

  async changeDocStatus(
    id: string,
    dto: ChangeTripDocStatusDto,
    activity?: ActivityActorContext,
  ) {
    if (!dto?.docStatus) {
      throw new BadRequestException('docStatus is required');
    }

    const exists = await this.tripRepo.exist({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Trip not found');
    }

    await this.tripRepo.update(id, { docStatus: dto.docStatus });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Trip',
        entityId: id,
        record: result.tripCode,
        description: `Changed trip ${result.tripCode} doc status to ${dto.docStatus}`,
        metadata: { docStatus: dto.docStatus },
      },
      activity,
    );
    return result;
  }

  async removeDocument(
    tripId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      select: ['id', 'tripCode'],
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const doc = await this.tripDocumentRepo.findOne({
      where: { id: documentId, tripId },
    });
    if (!doc) {
      throw new NotFoundException('Trip document not found');
    }

    const record = doc.name ?? documentId;

    if (doc.file) {
      try {
        await this.s3Service.deleteObject(doc.file);
      } catch {
        // Continue DB delete even if S3 object is already gone
      }
    }

    await this.tripDocumentRepo.delete(doc.id);

    const remaining = await this.tripDocumentRepo.count({ where: { tripId } });
    if (remaining === 0) {
      await this.tripRepo.update(tripId, { docStatus: TripDocStatus.PENDING });
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'TripDocument',
        entityId: documentId,
        record,
        description: `Deleted trip document ${record} from trip ${trip.tripCode}`,
        metadata: {
          tripId,
          remainingDocuments: remaining,
          ...(remaining === 0
            ? { docStatus: TripDocStatus.PENDING }
            : {}),
        },
      },
      activity,
    );

    return this.findOne(tripId);
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
    const trip = await this.findByIdOrFail(tripId);

    await this.dataSource.transaction(async (manager) => {
      const ctx = await this.loadExpenseLedgerContext(
        manager,
        kind,
        tripId,
        expenseId,
      );
      if (!ctx) {
        throw new NotFoundException(`${kind} expense not found`);
      }

      await ctx.save(manager, dto.status);

      // PAID → credit linked COA (cash/bank out or vendor payable booked).
      if (dto.status === TripExpenseStatus.PAID) {
        const desc =
          ctx.description?.trim() ||
          `Trip ${trip.tripCode} ${kind} expense`;
        await this.transactionsService.postEntry(
          {
            chartOfAccountId: ctx.chartOfAccountId,
            referenceType: ctx.referenceType,
            referenceId: expenseId,
            transactionDate: ctx.expenseDate,
            description: desc,
            creditAmount: ctx.amount,
            idempotent: true,
          },
          manager,
        );
      }
    });

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

  async updateOfficeExpense(
    tripId: string,
    expenseId: string,
    dto: UpdateTripOfficeExpenseDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateExpenseEntry('office', tripId, expenseId, dto, activity);
  }

  async updatePumpExpense(
    tripId: string,
    expenseId: string,
    dto: UpdateTripPumpExpenseDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateExpenseEntry('pump', tripId, expenseId, dto, activity);
  }

  async updateMtagExpense(
    tripId: string,
    expenseId: string,
    dto: UpdateTripAssetExpenseDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateExpenseEntry('mtag', tripId, expenseId, dto, activity);
  }

  async updateOtherExpense(
    tripId: string,
    expenseId: string,
    dto: UpdateTripAssetExpenseDto,
    activity?: ActivityActorContext,
  ) {
    return this.updateExpenseEntry('other', tripId, expenseId, dto, activity);
  }

  async deleteOfficeExpense(
    tripId: string,
    expenseId: string,
    activity?: ActivityActorContext,
  ) {
    return this.deleteExpenseEntry('office', tripId, expenseId, activity);
  }

  async deletePumpExpense(
    tripId: string,
    expenseId: string,
    activity?: ActivityActorContext,
  ) {
    return this.deleteExpenseEntry('pump', tripId, expenseId, activity);
  }

  async deleteMtagExpense(
    tripId: string,
    expenseId: string,
    activity?: ActivityActorContext,
  ) {
    return this.deleteExpenseEntry('mtag', tripId, expenseId, activity);
  }

  async deleteOtherExpense(
    tripId: string,
    expenseId: string,
    activity?: ActivityActorContext,
  ) {
    return this.deleteExpenseEntry('other', tripId, expenseId, activity);
  }

  private async deleteExpenseEntry(
    kind: ExpenseKind,
    tripId: string,
    expenseId: string,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(tripId);

    await this.dataSource.transaction(async (manager) => {
      const ctx = await this.loadExpenseLedgerContext(
        manager,
        kind,
        tripId,
        expenseId,
      );
      if (!ctx) {
        throw new NotFoundException(`${kind} expense not found`);
      }

      this.assertCanDeleteExpense(kind, ctx.status, activity?.actor);

      // Remove ledger line first (if PAID / any prior post), then recalc balances.
      await this.transactionsService.deleteReferencedEntry(
        {
          referenceType: ctx.referenceType,
          referenceId: expenseId,
        },
        manager,
      );

      await this.hardDeleteExpenseRow(manager, kind, tripId, expenseId);
    });

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'TripExpense',
        entityId: expenseId,
        record: result.tripCode,
        description: `Deleted trip ${result.tripCode} ${kind} expense`,
        metadata: { kind, expenseId },
      },
      activity,
    );
    return result;
  }

  private assertCanDeleteExpense(
    kind: ExpenseKind,
    status: TripExpenseStatus,
    actor?: User | null,
  ) {
    if (status !== TripExpenseStatus.PAID) return;

    const permission = PAID_EDIT_PERMISSION[kind];
    if (!userHasPermission(actor, permission)) {
      throw new ForbiddenException(
        `Missing required permission: ${permission}`,
      );
    }
  }

  private async hardDeleteExpenseRow(
    manager: EntityManager,
    kind: ExpenseKind,
    tripId: string,
    expenseId: string,
  ) {
    const entity =
      kind === 'office'
        ? TripOfficeExpense
        : kind === 'pump'
          ? TripPumpExpense
          : kind === 'mtag'
            ? TripMtagExpense
            : TripOtherExpense;
    const result = await manager.delete(entity, { id: expenseId, tripId });
    if (!result.affected) {
      throw new NotFoundException(`${kind} expense not found`);
    }
  }

  private async updateExpenseEntry(
    kind: ExpenseKind,
    tripId: string,
    expenseId: string,
    dto:
      | UpdateTripOfficeExpenseDto
      | UpdateTripPumpExpenseDto
      | UpdateTripAssetExpenseDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.findByIdOrFail(tripId);

    await this.dataSource.transaction(async (manager) => {
      switch (kind) {
        case 'office':
          await this.applyOfficeExpenseUpdate(
            manager,
            trip,
            expenseId,
            dto as UpdateTripOfficeExpenseDto,
            activity?.actor,
          );
          break;
        case 'pump':
          await this.applyPumpExpenseUpdate(
            manager,
            trip,
            expenseId,
            dto as UpdateTripPumpExpenseDto,
            activity?.actor,
          );
          break;
        case 'mtag':
          await this.applyAssetExpenseUpdate(
            manager,
            trip,
            'mtag',
            TripMtagExpense,
            AccountTransactionReferenceType.TRIP_MTAG_EXPENSE,
            expenseId,
            dto as UpdateTripAssetExpenseDto,
            activity?.actor,
          );
          break;
        case 'other':
          await this.applyAssetExpenseUpdate(
            manager,
            trip,
            'other',
            TripOtherExpense,
            AccountTransactionReferenceType.TRIP_OTHER_EXPENSE,
            expenseId,
            dto as UpdateTripAssetExpenseDto,
            activity?.actor,
          );
          break;
      }
    });

    const result = await this.findOne(tripId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripExpense',
        entityId: expenseId,
        record: result.tripCode,
        description: `Updated trip ${result.tripCode} ${kind} expense`,
        metadata: { kind, expenseId },
      },
      activity,
    );
    return result;
  }

  private assertCanEditExpense(
    kind: ExpenseKind,
    status: TripExpenseStatus,
    actor?: User | null,
  ) {
    if (status === TripExpenseStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled expense');
    }
    if (status !== TripExpenseStatus.PAID) return;

    const permission = PAID_EDIT_PERMISSION[kind];
    if (!userHasPermission(actor, permission)) {
      throw new ForbiddenException(
        `Missing required permission: ${permission}`,
      );
    }
  }

  private async syncPaidExpenseLedger(
    manager: EntityManager,
    trip: Trip,
    kind: ExpenseKind,
    referenceType: AccountTransactionReferenceType,
    expenseId: string,
    amount: number,
    expenseDate: Date,
    description?: string | null,
  ) {
    const desc =
      description?.trim() || `Trip ${trip.tripCode} ${kind} expense`;
    await this.transactionsService.updateReferencedCreditEntry(
      {
        referenceType,
        referenceId: expenseId,
        creditAmount: amount,
        transactionDate: expenseDate,
        description: desc,
      },
      manager,
    );
  }

  private async applyOfficeExpenseUpdate(
    manager: EntityManager,
    trip: Trip,
    expenseId: string,
    dto: UpdateTripOfficeExpenseDto,
    actor?: User | null,
  ) {
    const row = await manager.findOne(TripOfficeExpense, {
      where: { id: expenseId, tripId: trip.id },
    });
    if (!row) throw new NotFoundException('office expense not found');

    this.assertCanEditExpense('office', row.status, actor);
    const isPaid = row.status === TripExpenseStatus.PAID;

    if (isPaid && dto.assetAccountId !== undefined) {
      throw new BadRequestException(
        'Cannot change account on a paid expense',
      );
    }

    if (dto.assetAccountId !== undefined) {
      await this.ensureAccount(dto.assetAccountId);
      row.assetAccountId = dto.assetAccountId;
    }
    if (dto.amount !== undefined) row.amount = this.formatMoney(dto.amount);
    if (dto.expenseDate !== undefined) {
      row.expenseDate = dto.expenseDate.slice(0, 10) as unknown as Date;
    }
    if (dto.description !== undefined) {
      row.description = this.nullableTrim(dto.description);
    }

    await manager.save(row);

    if (isPaid) {
      await this.syncPaidExpenseLedger(
        manager,
        trip,
        'office',
        AccountTransactionReferenceType.TRIP_OFFICE_EXPENSE,
        expenseId,
        Number(row.amount),
        row.expenseDate,
        row.description,
      );
    }
  }

  private async applyPumpExpenseUpdate(
    manager: EntityManager,
    trip: Trip,
    expenseId: string,
    dto: UpdateTripPumpExpenseDto,
    actor?: User | null,
  ) {
    const row = await manager.findOne(TripPumpExpense, {
      where: { id: expenseId, tripId: trip.id },
    });
    if (!row) throw new NotFoundException('pump expense not found');

    this.assertCanEditExpense('pump', row.status, actor);
    const isPaid = row.status === TripExpenseStatus.PAID;

    if (isPaid && (dto.vendorId !== undefined || dto.vendorProductId !== undefined)) {
      throw new BadRequestException(
        'Cannot change vendor/product on a paid expense',
      );
    }

    if (dto.vendorId !== undefined) {
      await this.ensureVendor(dto.vendorId);
      row.vendorId = dto.vendorId;
      row.vendorAccountId = await this.resolveVendorAccountId(dto.vendorId);
    }
    if (dto.vendorProductId !== undefined) {
      if (dto.vendorProductId) {
        await this.ensureVendorProduct(dto.vendorProductId);
        row.vendorProductId = dto.vendorProductId;
      } else {
        row.vendorProductId = null;
      }
    }
    if (dto.rate !== undefined) row.rate = this.formatMoney(dto.rate);
    if (dto.quantity !== undefined) {
      row.quantity = this.formatQty(dto.quantity);
    }
    if (dto.amount !== undefined) row.amount = this.formatMoney(dto.amount);
    if (dto.cashAmount !== undefined) {
      row.cashAmount = this.formatMoney(dto.cashAmount);
    }
    if (dto.totalAmount !== undefined) {
      row.totalAmount = this.formatMoney(dto.totalAmount);
    }
    if (dto.expenseDate !== undefined) {
      row.expenseDate = dto.expenseDate.slice(0, 10) as unknown as Date;
    }
    if (dto.lable !== undefined) {
      row.lable = this.nullableTrim(dto.lable);
    }
    if (dto.description !== undefined) {
      row.description = this.nullableTrim(dto.description);
    }

    await manager.save(row);

    if (isPaid) {
      await this.syncPaidExpenseLedger(
        manager,
        trip,
        'pump',
        AccountTransactionReferenceType.TRIP_PUMP_EXPENSE,
        expenseId,
        this.resolvePumpLedgerAmount(row),
        row.expenseDate,
        row.description ?? row.lable,
      );
    }
  }

  private async applyAssetExpenseUpdate(
    manager: EntityManager,
    trip: Trip,
    kind: 'mtag' | 'other',
    Entity: typeof TripMtagExpense | typeof TripOtherExpense,
    referenceType: AccountTransactionReferenceType,
    expenseId: string,
    dto: UpdateTripAssetExpenseDto,
    actor?: User | null,
  ) {
    const row = await manager.findOne(Entity, {
      where: { id: expenseId, tripId: trip.id },
    });
    if (!row) throw new NotFoundException(`${kind} expense not found`);

    this.assertCanEditExpense(kind, row.status, actor);
    const isPaid = row.status === TripExpenseStatus.PAID;

    if (isPaid && dto.assetAccountId !== undefined) {
      throw new BadRequestException(
        'Cannot change account on a paid expense',
      );
    }

    if (dto.assetAccountId !== undefined) {
      await this.ensureAccount(dto.assetAccountId);
      row.assetAccountId = dto.assetAccountId;
    }
    if (dto.amount !== undefined) row.amount = this.formatMoney(dto.amount);
    if (dto.expenseDate !== undefined) {
      row.expenseDate = dto.expenseDate.slice(0, 10) as unknown as Date;
    }
    if (dto.description !== undefined) {
      row.description = this.nullableTrim(dto.description);
    }

    await manager.save(row);

    if (isPaid) {
      await this.syncPaidExpenseLedger(
        manager,
        trip,
        kind,
        referenceType,
        expenseId,
        Number(row.amount),
        row.expenseDate,
        row.description,
      );
    }
  }

  private async loadExpenseLedgerContext(
    manager: EntityManager,
    kind: ExpenseKind,
    tripId: string,
    expenseId: string,
  ): Promise<ExpenseLedgerContext | null> {
    switch (kind) {
      case 'office': {
        const row = await manager.findOne(TripOfficeExpense, {
          where: { id: expenseId, tripId },
        });
        if (!row) return null;
        return {
          chartOfAccountId: row.assetAccountId,
          referenceType: AccountTransactionReferenceType.TRIP_OFFICE_EXPENSE,
          amount: Number(row.amount),
          expenseDate: row.expenseDate,
          description: row.description,
          status: row.status,
          save: async (m, status) => {
            row.status = status;
            await m.save(row);
          },
        };
      }
      case 'pump': {
        const row = await manager.findOne(TripPumpExpense, {
          where: { id: expenseId, tripId },
        });
        if (!row) return null;
        return {
          chartOfAccountId: row.vendorAccountId,
          referenceType: AccountTransactionReferenceType.TRIP_PUMP_EXPENSE,
          amount: this.resolvePumpLedgerAmount(row),
          expenseDate: row.expenseDate,
          description: row.description ?? row.lable,
          status: row.status,
          save: async (m, status) => {
            row.status = status;
            await m.save(row);
          },
        };
      }
      case 'mtag': {
        const row = await manager.findOne(TripMtagExpense, {
          where: { id: expenseId, tripId },
        });
        if (!row) return null;
        return {
          chartOfAccountId: row.assetAccountId,
          referenceType: AccountTransactionReferenceType.TRIP_MTAG_EXPENSE,
          amount: Number(row.amount),
          expenseDate: row.expenseDate,
          description: row.description,
          status: row.status,
          save: async (m, status) => {
            row.status = status;
            await m.save(row);
          },
        };
      }
      case 'other': {
        const row = await manager.findOne(TripOtherExpense, {
          where: { id: expenseId, tripId },
        });
        if (!row) return null;
        return {
          chartOfAccountId: row.assetAccountId,
          referenceType: AccountTransactionReferenceType.TRIP_OTHER_EXPENSE,
          amount: Number(row.amount),
          expenseDate: row.expenseDate,
          description: row.description,
          status: row.status,
          save: async (m, status) => {
            row.status = status;
            await m.save(row);
          },
        };
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
    if (dto.offLoadingDateTime !== undefined) {
      load.offLoadingDateTime = this.toOptionalDateTime(
        dto.offLoadingDateTime,
      );
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

  /** Attach UC/DC loads (+ client, bilty) without breaking list pagination joins. */
  private async attachLoadsForList(trips: Trip[]) {
    if (!trips.length) return;
    const ids = trips.map((t) => t.id);
    const withLoads = await this.tripRepo.find({
      where: { id: In(ids) },
      relations: {
        upcountryLoads: { client: true, bilty: true },
        downcountryLoads: { client: true, bilty: true },
      },
      order: {
        upcountryLoads: { createdAt: 'ASC' },
        downcountryLoads: { createdAt: 'ASC' },
      },
    });
    const byId = new Map(withLoads.map((t) => [t.id, t]));
    for (const trip of trips) {
      const full = byId.get(trip.id);
      trip.upcountryLoads = full?.upcountryLoads ?? [];
      trip.downcountryLoads = full?.downcountryLoads ?? [];
    }
  }

  private applyListFilters(
    qb: SelectQueryBuilder<Trip>,
    query: TripListQueryDto,
  ): SelectQueryBuilder<Trip> {
    const needsVehicleJoin =
      !!query.search?.trim() &&
      !qb.expressionMap.joinAttributes.some((j) => j.alias?.name === 'vehicle');
    const needsDriverJoin =
      !!query.driverId &&
      !qb.expressionMap.joinAttributes.some(
        (j) => j.alias?.name === 'tripDriver',
      );

    if (needsVehicleJoin) {
      qb.leftJoin('trip.vehicle', 'vehicle');
    }
    if (needsDriverJoin) {
      qb.leftJoin('trip.drivers', 'tripDriver');
    }

    if (query.status) {
      qb.andWhere('trip.status = :status', { status: query.status });
    }
    if (query.docStatus) {
      qb.andWhere('trip.docStatus = :docStatus', {
        docStatus: query.docStatus,
      });
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
          OR EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."tripId" = trip.id
              AND ul."deliveryChallanNumber" ILIKE :search
          )
          OR EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."tripId" = trip.id
              AND dl."deliveryChallanNumber" ILIKE :search
          )
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
      [TripStatus.IN_TRANSIT]: 0,
      [TripStatus.COMPLETED]: 0,
      [TripStatus.CANCELLED]: 0,
    };

    const byDocStatus: Record<TripDocStatus, number> = {
      [TripDocStatus.PENDING]: 0,
      [TripDocStatus.RECEIVED]: 0,
    };

    // UC/DC load + doc-status cards are always all-trips (ignore list filters).
    const [totalUpcountryLoads, totalDowncountryLoads, docStatusRows] =
      await Promise.all([
        this.upcountryRepo.count(),
        this.downcountryRepo.count(),
        this.tripRepo
          .createQueryBuilder('trip')
          .select('trip.docStatus', 'docStatus')
          .addSelect('COUNT(*)', 'count')
          .groupBy('trip.docStatus')
          .getRawMany<{ docStatus: TripDocStatus; count: string }>(),
      ]);

    for (const row of docStatusRows) {
      byDocStatus[row.docStatus] = Number(row.count) || 0;
    }

    if (!tripIds.length) {
      return {
        totalTrips: 0,
        byStatus,
        byDocStatus,
        docsReceived: byDocStatus[TripDocStatus.RECEIVED],
        docsNotReceived: byDocStatus[TripDocStatus.PENDING],
        totalUpcountryLoads,
        totalDowncountryLoads,
        expenses: {
          office: '0.00',
          pump: '0.00',
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

    const [office, pump, mtag, other] = await Promise.all([
      this.sumExpenseAmount(this.officeExpenseRepo, tripIds),
      this.sumExpenseAmount(this.pumpExpenseRepo, tripIds),
      this.sumExpenseAmount(this.mtagExpenseRepo, tripIds),
      this.sumExpenseAmount(this.otherExpenseRepo, tripIds),
    ]);

    const total =
      Number(office) + Number(pump) + Number(mtag) + Number(other);

    return {
      totalTrips: tripIds.length,
      byStatus,
      byDocStatus,
      docsReceived: byDocStatus[TripDocStatus.RECEIVED],
      docsNotReceived: byDocStatus[TripDocStatus.PENDING],
      totalUpcountryLoads,
      totalDowncountryLoads,
      expenses: {
        office: this.formatMoney(office),
        pump: this.formatMoney(pump),
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

  /** Per-trip expense totals (excl. cancelled) across all expense kinds. */
  private async sumExpenseTotalsByTripIds(
    tripIds: string[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (!tripIds.length) return totals;

    const repos = [
      this.officeExpenseRepo,
      this.pumpExpenseRepo,
      this.mtagExpenseRepo,
      this.otherExpenseRepo,
    ] as const;

    const groups = await Promise.all(
      repos.map((repo) =>
        repo
          .createQueryBuilder('expense')
          .select('expense.tripId', 'tripId')
          .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
          .where('expense.tripId IN (:...tripIds)', { tripIds })
          .andWhere('expense.status != :cancelled', {
            cancelled: TripExpenseStatus.CANCELLED,
          })
          .groupBy('expense.tripId')
          .getRawMany<{ tripId: string; total: string }>(),
      ),
    );

    for (const rows of groups) {
      for (const row of rows) {
        const prev = totals.get(row.tripId) ?? 0;
        totals.set(row.tripId, prev + Number(row.total ?? 0));
      }
    }
    return totals;
  }

  private async findByIdOrFail(id: string) {
    const trip = await this.tripRepo.findOne({
      where: { id },
      relations: this.fullTripRelations(),
      order: this.fullTripRelationOrder(),
    });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  private withDocumentUrls(trip: Trip): Trip {
    for (const doc of trip.documents ?? []) {
      Object.assign(doc, {
        fileUrl: doc.file ? this.s3Service.getObjectUrl(doc.file) : null,
      });
    }
    return trip;
  }

  private fileExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 10) {
      return fromName.toLowerCase();
    }
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    return '';
  }

  /** Utility list: skip expense row payloads (totals fetched separately). */
  private utilityTripRelations() {
    return {
      vehicle: {
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
      drivers: { driver: { user: true } },
      upcountryLoads: {
        client: true,
        bilty: {
          loadings: { client: true, pickupLocation: true },
          offLoadings: { client: true, dropoffLocation: true },
        },
      },
      downcountryLoads: {
        client: true,
        bilty: {
          loadings: { client: true, pickupLocation: true },
          offLoadings: { client: true, dropoffLocation: true },
        },
      },
    } as const;
  }

  private utilityTripRelationOrder() {
    return {
      drivers: { createdAt: 'ASC' as const },
      upcountryLoads: { createdAt: 'ASC' as const },
      downcountryLoads: { createdAt: 'ASC' as const },
    };
  }

  /**
   * For utilities/trips/list?clientId=… — match client rate by trip vehicle
   * type + size/capacity and attach freightrate as freightAmount.
   */
  private async resolveFreightAmountsByTrip(
    clientId: string,
    trips: Trip[],
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (!trips.length) return result;

    const rates = await this.clientRateRepo.find({
      where: { clientId },
      relations: { vehicleType: true },
      order: { freightrate: 'ASC', createdAt: 'DESC' },
    });

    const rateByKey = new Map<string, string>();
    for (const rate of rates) {
      const key = this.clientRateMatchKey(
        rate.vehicleTypeId,
        rate.vehicleSizeId ?? null,
        rate.vehicleCapacityId ?? null,
      );
      if (!rateByKey.has(key)) {
        rateByKey.set(key, this.formatMoney(Number(rate.freightrate)));
      }
    }

    for (const trip of trips) {
      const vehicle = trip.vehicle;
      const typeId = vehicle?.vehicleTypeId;
      if (!typeId) {
        result.set(trip.id, null);
        continue;
      }

      const measurement = vehicle.vehicleType?.measurement;
      let sizeId: string | null = null;
      let capacityId: string | null = null;

      if (measurement === VehicleTypeMeasurement.SIZE) {
        sizeId = vehicle.vehicleSizeId ?? null;
      } else if (measurement === VehicleTypeMeasurement.CAPACITY) {
        capacityId = vehicle.vehicleCapacityId ?? null;
      } else {
        // Fallback if type relation missing: try size then capacity from vehicle.
        sizeId = vehicle.vehicleSizeId ?? null;
        capacityId = sizeId ? null : (vehicle.vehicleCapacityId ?? null);
      }

      if (
        (measurement === VehicleTypeMeasurement.SIZE && !sizeId) ||
        (measurement === VehicleTypeMeasurement.CAPACITY && !capacityId)
      ) {
        result.set(trip.id, null);
        continue;
      }

      result.set(
        trip.id,
        rateByKey.get(this.clientRateMatchKey(typeId, sizeId, capacityId)) ??
          null,
      );
    }

    return result;
  }

  private clientRateMatchKey(
    vehicleTypeId: string,
    vehicleSizeId: string | null,
    vehicleCapacityId: string | null,
  ): string {
    return `${vehicleTypeId}|${vehicleSizeId ?? ''}|${vehicleCapacityId ?? ''}`;
  }

  private sortBiltyLoadSections(
    loads?: Array<{ bilty?: Bilty | null }> | null,
  ) {
    for (const load of loads ?? []) {
      const bilty = load.bilty;
      if (!bilty) continue;
      bilty.loadings = [...(bilty.loadings ?? [])].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      bilty.offLoadings = [...(bilty.offLoadings ?? [])].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
  }

  private fullTripRelations() {
    return {
      vehicle: {
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
      drivers: { driver: { user: true } },
      upcountryLoads: { client: true, bilty: true },
      downcountryLoads: { client: true, bilty: true },
      officeExpenses: { assetAccount: true },
      pumpExpenses: { vendor: true, vendorAccount: true },
      mtagExpenses: { assetAccount: true },
      otherExpenses: { assetAccount: true },
      documents: true,
    } as const;
  }

  private fullTripRelationOrder() {
    return {
      drivers: { createdAt: 'ASC' as const },
      upcountryLoads: { createdAt: 'ASC' as const },
      downcountryLoads: { createdAt: 'ASC' as const },
      officeExpenses: { createdAt: 'ASC' as const },
      pumpExpenses: { createdAt: 'ASC' as const },
      mtagExpenses: { createdAt: 'ASC' as const },
      otherExpenses: { createdAt: 'ASC' as const },
      documents: { createdAt: 'ASC' as const },
    };
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
      if (item.vendorProductId) {
        await this.ensureVendorProduct(item.vendorProductId);
      }
      const fuel = Number(item.amount) || 0;
      const cash = Number(item.cashAmount) || 0;
      const total = Number(item.totalAmount) || 0;
      if (fuel <= 0 && cash <= 0 && total <= 0) {
        throw new BadRequestException(
          'Pump expense requires amount (fuel), cashAmount, or totalAmount',
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

  private async ensureVendorProduct(vendorProductId: string) {
    const exists = await this.vendorProductRepo.exist({
      where: { id: vendorProductId },
    });
    if (!exists) {
      throw new BadRequestException(
        `Vendor product not found: ${vendorProductId}`,
      );
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
      offLoadingDateTime: this.toOptionalDateTime(item.offLoadingDateTime),
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

    const reserved = new Set<string>();
    const rows: TripOfficeExpense[] = [];
    for (const item of items) {
      const voucherNumber = await this.generateUniqueExpenseVoucherNumber(
        manager,
        TripOfficeExpense,
        TRIP_OFFICE_EXPENSE_VOUCHER_PREFIX,
        reserved,
      );
      rows.push(
        manager.create(TripOfficeExpense, {
          tripId,
          voucherNumber,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      );
    }
    await manager.save(rows);
  }

  private async replacePumpExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripPumpExpenseDto[],
  ) {
    await manager.delete(TripPumpExpense, { tripId });
    if (!items.length) return;

    const reserved = new Set<string>();
    const rows: TripPumpExpense[] = [];
    for (const item of items) {
      const vendorAccountId = await this.resolveVendorAccountId(item.vendorId);
      const voucherNumber = await this.generateUniqueExpenseVoucherNumber(
        manager,
        TripPumpExpense,
        TRIP_PUMP_EXPENSE_VOUCHER_PREFIX,
        reserved,
      );
      rows.push(
        manager.create(TripPumpExpense, {
          tripId,
          voucherNumber,
          vendorId: item.vendorId,
          vendorAccountId,
          vendorProductId: item.vendorProductId?.trim()
            ? item.vendorProductId
            : null,
          rate: this.formatMoney(item.rate ?? 0),
          quantity: this.formatQty(item.quantity ?? 0),
          amount: this.formatMoney(item.amount ?? 0),
          cashAmount: this.formatMoney(item.cashAmount ?? 0),
          totalAmount: this.formatMoney(
            item.totalAmount ??
              (item.amount ?? 0) + (item.cashAmount ?? 0),
          ),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          lable: this.nullableTrim(item.lable),
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

    const reserved = new Set<string>();
    const rows: TripMtagExpense[] = [];
    for (const item of items) {
      const voucherNumber = await this.generateUniqueExpenseVoucherNumber(
        manager,
        TripMtagExpense,
        TRIP_MTAG_EXPENSE_VOUCHER_PREFIX,
        reserved,
      );
      rows.push(
        manager.create(TripMtagExpense, {
          tripId,
          voucherNumber,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      );
    }
    await manager.save(rows);
  }

  private async replaceOtherExpenses(
    manager: EntityManager,
    tripId: string,
    items: CreateTripAssetExpenseDto[],
  ) {
    await manager.delete(TripOtherExpense, { tripId });
    if (!items.length) return;

    const reserved = new Set<string>();
    const rows: TripOtherExpense[] = [];
    for (const item of items) {
      const voucherNumber = await this.generateUniqueExpenseVoucherNumber(
        manager,
        TripOtherExpense,
        TRIP_OTHER_EXPENSE_VOUCHER_PREFIX,
        reserved,
      );
      rows.push(
        manager.create(TripOtherExpense, {
          tripId,
          voucherNumber,
          assetAccountId: item.assetAccountId,
          amount: this.formatMoney(item.amount),
          expenseDate: item.expenseDate.slice(0, 10) as unknown as Date,
          description: this.nullableTrim(item.description),
          status: item.status ?? TripExpenseStatus.PENDING,
        }),
      );
    }
    await manager.save(rows);
  }

  private async generateUniqueExpenseVoucherNumber(
    manager: EntityManager,
    entity:
      | typeof TripOfficeExpense
      | typeof TripPumpExpense
      | typeof TripMtagExpense
      | typeof TripOtherExpense,
    prefix: string,
    reserved: Set<string>,
  ): Promise<string> {
    const repo = manager.getRepository(entity);
    for (let attempt = 0; attempt < 16; attempt++) {
      const code = await nextSerialCode(
        repo,
        prefix,
        'voucherNumber',
        6,
        attempt,
      );
      if (reserved.has(code)) continue;
      const existing = await repo.findOne({ where: { voucherNumber: code } });
      if (!existing) {
        reserved.add(code);
        return code;
      }
    }
    throw new BadRequestException(
      `Could not generate unique ${prefix} voucher number`,
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

  /**
   * Ledger / payable amount for a pump expense.
   * `amount` = fuel (HSD) credit; cash-only trips use cashAmount / totalAmount.
   */
  private resolvePumpLedgerAmount(
    row: Pick<TripPumpExpense, 'amount' | 'cashAmount' | 'totalAmount'>,
  ): number {
    const fuel = Number(row.amount) || 0;
    const cash = Number(row.cashAmount) || 0;
    const total = Number(row.totalAmount) || 0;
    const resolved = total > 0 ? total : fuel + cash;
    if (resolved <= 0) {
      throw new BadRequestException(
        'Pump expense requires amount (fuel), cashAmount, or totalAmount greater than 0',
      );
    }
    return Math.round(resolved * 100) / 100;
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

  private toOptionalDateTime(value?: string | null): string | null {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
}
