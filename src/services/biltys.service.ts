import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  BiltyListQueryDto,
  ChangeBiltyStatusDto,
  CreateBiltyDto,
  CreateBiltyLoadingDto,
  CreateBiltyOffLoadingDto,
  UpdateBiltyDto,
} from '../auth/dto/bilty.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { buildCode128PngBuffer } from '../common/utils/barcode.util';
import {
  buildPublicApiLinks,
  parseCodeOrId,
} from '../common/utils/public-link.util';
import {
  BILTY_CODE_PAD,
  BILTY_CODE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Bilty,
  BiltyLoadType,
  BiltyLoading,
  BiltyOffLoading,
  BiltyStatus,
} from '../database/entities/bilty.entity';
import {
  Client,
  ClientCategory,
  ClientDropoffLocation,
  ClientPickupLocation,
  ClientStatus,
} from '../database/entities/client.entity';
import { Driver } from '../database/entities/driver.entity';
import { TransportationProduct } from '../database/entities/transportation-product.entity';
import {
  Trip,
  TripDowncountryLoad,
  TripLoadStatus,
  TripUpcountryLoad,
} from '../database/entities/trip.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

type BiltyTripSummary = {
  id: string;
  tripCode: string;
  tripDate: string | Date | null;
  status: string;
  auditStatus: string;
};

@Injectable()
export class BiltysService {
  constructor(
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(TransportationProduct)
    private readonly transportationProductRepo: Repository<TransportationProduct>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientPickupLocation)
    private readonly pickupRepo: Repository<ClientPickupLocation>,
    @InjectRepository(ClientDropoffLocation)
    private readonly dropoffRepo: Repository<ClientDropoffLocation>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateBiltyDto,
    createdById: string,
    activity?: ActivityActorContext,
  ) {
    await this.ensureDriver(dto.driverId);
    const brokerId = await this.resolvePartyClientId(
      dto.brokerId,
      ClientCategory.BROKER,
      'brokerId',
    );
    const transporterClient = await this.resolvePartyClient(
      dto.transporterId,
      ClientCategory.TRANSPORTER,
      'transporterId',
    );
    const transporterId = transporterClient?.id ?? null;
    const transportationProductId = await this.resolveTransportationProductId(
      dto.transportationProductId,
    );
    const nameFromDto = this.pickTransporterName(dto);
    const phoneFromDto = this.pickTransporterPhone(dto);
    const transporterName =
      nameFromDto !== undefined
        ? this.nullableTrim(nameFromDto)
        : transporterClient?.companyName ?? null;
    const transporterPhone =
      phoneFromDto !== undefined
        ? this.nullableTrim(phoneFromDto)
        : this.nullableTrim(transporterClient?.ptclNo);
    const vehicleFields = await this.resolveVehicleFields(
      dto.vehicleId,
      dto.vehicleRegistrationNumber,
      true,
    );

    const loadings = dto.loadings ?? [];
    const offLoadings = dto.offLoadings ?? [];
    await this.validateLoadings(loadings);
    await this.validateOffLoadings(offLoadings);

    const code = await this.generateUniqueCode();
    const refNumber = this.buildRefNumber(code, dto.issueDate);

    const savedId = await this.dataSource.transaction(async (manager) => {
      const bilty = await manager.save(
        manager.create(Bilty, {
          code,
          issueDate: dto.issueDate.slice(0, 10) as unknown as Date,
          loadType: dto.loadType,
          estimatedHours:
            dto.estimatedHours === undefined || dto.estimatedHours === null
              ? null
              : dto.estimatedHours,
          odometer:
            dto.odometer === undefined || dto.odometer === null
              ? null
              : dto.odometer,
          driverId: dto.driverId,
          brokerId,
          transportationProductId,
          vehicleId: vehicleFields.vehicleId,
          vehicleRegistrationNumber: vehicleFields.vehicleRegistrationNumber,
          description: this.nullableTrim(dto.description),
          remarks: this.nullableTrim(dto.remarks),
          refNumber,
          totalWeight: this.nullableTrim(dto.totalWeight),
          noOfPackages: this.nullableTrim(dto.noOfPackages),
          transporterId,
          transporterName,
          transporterPhone,
          createdById,
          status: dto.status ?? BiltyStatus.PENDING,
        }),
      );

      await this.replaceLoadings(manager, bilty.id, loadings);
      await this.replaceOffLoadings(manager, bilty.id, offLoadings);

      return bilty.id;
    });

    const result = await this.findOne(savedId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: savedId,
        record: code,
        description: `Created bilty ${code}`,
      },
      activity,
    );
    return result;
  }

  /**
   * Distinct vehicle reg numbers used on biltys.
   * Covers fleet-linked (`vehicle.regNo`) and free-text (`vehicleRegistrationNumber`).
   */
  async listBiltyVehiclesUtility(opts: { search?: string } = {}) {
    const qb = this.biltyRepo
      .createQueryBuilder('bilty')
      .leftJoin('bilty.vehicle', 'vehicle')
      .select('bilty.vehicleId', 'vehicleId')
      .addSelect('vehicle.regNo', 'fleetReg')
      .addSelect('bilty.vehicleRegistrationNumber', 'freeTextReg')
      .where(
        `(
          (vehicle.regNo IS NOT NULL AND TRIM(vehicle.regNo) <> '')
          OR (
            bilty.vehicleRegistrationNumber IS NOT NULL
            AND TRIM(bilty.vehicleRegistrationNumber) <> ''
          )
        )`,
      );

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          vehicle.regNo ILIKE :search
          OR bilty.vehicleRegistrationNumber ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany<{
      vehicleId: string | null;
      fleetReg: string | null;
      freeTextReg: string | null;
    }>();

    const byReg = new Map<
      string,
      {
        id: string | null;
        vehicleId: string | null;
        regNo: string;
        label: string;
      }
    >();

    for (const row of rows) {
      const regNo = (row.fleetReg || row.freeTextReg || '').trim();
      if (!regNo) continue;
      const key = regNo.toLowerCase();
      const vehicleId = row.vehicleId ?? null;
      const existing = byReg.get(key);
      // Prefer a fleet-linked row when the same plate appears both ways.
      if (!existing || (!existing.vehicleId && vehicleId)) {
        byReg.set(key, {
          id: vehicleId,
          vehicleId,
          regNo,
          label: regNo,
        });
      }
    }

    return {
      data: [...byReg.values()].sort((a, b) =>
        a.regNo.localeCompare(b.regNo, undefined, { sensitivity: 'base' }),
      ),
    };
  }

  /**
   * Lightweight bilty list for trip load pickers / connected forms.
   */
  async listUtility(
    opts: {
      search?: string;
      status?: BiltyStatus;
      clientId?: string;
      brokerId?: string;
      transporterId?: string;
      loadType?: BiltyLoadType;
      unassigned?: boolean;
      tripId?: string;
      driverId?: string;
      vehicleId?: string;
      vehicleRegNo?: string;
      vehicleTypeId?: string;
      vehicleSizeId?: string;
      vehicleCapacityId?: string;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));

    const qb = this.biltyRepo
      .createQueryBuilder('bilty')
      .distinct(true)
      .leftJoinAndSelect('bilty.loadings', 'loading')
      .leftJoinAndSelect('bilty.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('vehicle.vehicleSize', 'vehicleSize')
      .leftJoinAndSelect('vehicle.vehicleCapacity', 'vehicleCapacity')
      .orderBy('bilty.createdAt', 'DESC')
      .addOrderBy('loading.createdAt', 'ASC')
      .take(limit);

    this.applyBiltyPickerFilters(qb, opts);

    const rows = await qb.getMany();
    const tripsByBiltyId = await this.findTripsByBiltyIds(rows.map((r) => r.id));

    return {
      data: rows.map((bilty) => {
        const loadings = [...(bilty.loadings ?? [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const clientId =
          opts.clientId ??
          loadings.find((row) => !!row.clientId)?.clientId ??
          null;
        const trips = tripsByBiltyId.get(bilty.id) ?? [];
        const primary = trips[0] ?? null;

        return {
          id: bilty.id,
          refNumber: bilty.refNumber ?? null,
          clientId,
          brokerId: bilty.brokerId ?? null,
          transporterId: bilty.transporterId ?? null,
          code: bilty.code,
          status: bilty.status,
          loadType: bilty.loadType,
          issueDate: bilty.issueDate,
          driverId: bilty.driverId,
          vehicleId: bilty.vehicleId ?? null,
          vehicleRegistrationNumber: bilty.vehicleRegistrationNumber ?? null,
          vehicleNo:
            bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber ?? null,
          vehicleTypeId: bilty.vehicle?.vehicleTypeId ?? null,
          vehicleSizeId: bilty.vehicle?.vehicleSizeId ?? null,
          vehicleCapacityId: bilty.vehicle?.vehicleCapacityId ?? null,
          vehicle: bilty.vehicle
            ? {
                id: bilty.vehicle.id,
                regNo: bilty.vehicle.regNo,
                vehicleTypeId: bilty.vehicle.vehicleTypeId ?? null,
                vehicleSizeId: bilty.vehicle.vehicleSizeId ?? null,
                vehicleCapacityId: bilty.vehicle.vehicleCapacityId ?? null,
                vehicleType: bilty.vehicle.vehicleType
                  ? {
                      id: bilty.vehicle.vehicleType.id,
                      name: bilty.vehicle.vehicleType.name,
                      measurement: bilty.vehicle.vehicleType.measurement,
                    }
                  : null,
                vehicleSize: bilty.vehicle.vehicleSize
                  ? {
                      id: bilty.vehicle.vehicleSize.id,
                      name: bilty.vehicle.vehicleSize.name,
                    }
                  : null,
                vehicleCapacity: bilty.vehicle.vehicleCapacity
                  ? {
                      id: bilty.vehicle.vehicleCapacity.id,
                      name: bilty.vehicle.vehicleCapacity.name,
                    }
                  : null,
              }
            : null,
          trips,
          tripId: primary?.id ?? null,
          label: bilty.code,
        };
      }),
    };
  }

  async findAll(query: BiltyListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const applyFilters = (
      qb: ReturnType<Repository<Bilty>['createQueryBuilder']>,
    ) => {
      if (query.status) {
        qb.andWhere('bilty.status = :status', { status: query.status });
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
      if (query.departureDateFrom || query.departureDateTo) {
        const depConds: string[] = [
          'l."biltyId" = bilty.id',
          'l."departureDateTime" IS NOT NULL',
        ];
        const depParams: Record<string, string> = {};
        if (query.departureDateFrom) {
          depConds.push('l."departureDateTime" >= :departureDateFrom');
          depParams.departureDateFrom = this.toRangeStart(
            query.departureDateFrom,
          );
        }
        if (query.departureDateTo) {
          depConds.push('l."departureDateTime" < :departureDateToExclusive');
          depParams.departureDateToExclusive = this.toRangeEndExclusive(
            query.departureDateTo,
          );
        }
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM bilty_loadings l
            WHERE ${depConds.join(' AND ')}
          )`,
          depParams,
        );
      }
      if (query.offLoadingDateFrom || query.offLoadingDateTo) {
        const olConds: string[] = [
          'ol."biltyId" = bilty.id',
          'ol."offLoadingDateTime" IS NOT NULL',
        ];
        const olParams: Record<string, string> = {};
        if (query.offLoadingDateFrom) {
          olConds.push('ol."offLoadingDateTime" >= :offLoadingDateFrom');
          olParams.offLoadingDateFrom = this.toRangeStart(
            query.offLoadingDateFrom,
          );
        }
        if (query.offLoadingDateTo) {
          olConds.push('ol."offLoadingDateTime" < :offLoadingDateToExclusive');
          olParams.offLoadingDateToExclusive = this.toRangeEndExclusive(
            query.offLoadingDateTo,
          );
        }
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM bilty_off_loadings ol
            WHERE ${olConds.join(' AND ')}
          )`,
          olParams,
        );
      }
      if (query.transportationProductId) {
        qb.andWhere('bilty.transportationProductId = :transportationProductId', {
          transportationProductId: query.transportationProductId,
        });
      }

      this.applyBiltyPickerFilters(qb, {
        status: undefined, // already applied above
        clientId: query.clientId,
        brokerId: query.brokerId,
        transporterId: query.transporterId,
        loadType: query.loadType,
        unassigned: query.unassigned,
        tripId: query.tripId,
        driverId: query.driverId,
        vehicleId: query.vehicleId,
        vehicleRegNo: query.vehicleRegNo,
        vehicleTypeId: query.vehicleTypeId,
        vehicleSizeId: query.vehicleSizeId,
        vehicleCapacityId: query.vehicleCapacityId,
        search: undefined, // search handled below with richer fields
      });

      const search = query.search?.trim();
      if (search) {
        qb.andWhere(
          `(
            bilty.code ILIKE :search
            OR bilty.description ILIKE :search
            OR bilty.refNumber ILIKE :search
            OR bilty.transporterName ILIKE :search
            OR bilty.vehicleRegistrationNumber ILIKE :search
            OR vehicle.regNo ILIKE :search
            OR driverUser.name ILIKE :search
          )`,
          { search: `%${search}%` },
        );
      }
      return qb;
    };

    const needsSearchJoins = !!query.search?.trim();
    const needsVehicleJoin =
      needsSearchJoins ||
      !!query.vehicleRegNo?.trim() ||
      !!query.vehicleId ||
      !!query.vehicleTypeId ||
      !!query.vehicleSizeId ||
      !!query.vehicleCapacityId;

    const applyListJoins = (
      qb: ReturnType<Repository<Bilty>['createQueryBuilder']>,
    ) => {
      if (needsSearchJoins) {
        qb.leftJoin('bilty.driver', 'driver')
          .leftJoin('driver.user', 'driverUser')
          .leftJoin('bilty.vehicle', 'vehicle');
      } else if (needsVehicleJoin) {
        qb.leftJoin('bilty.vehicle', 'vehicle');
      }
      return qb;
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder: 'ASC' | 'DESC' =
      query.sortOrder ?? (sortBy === 'code' ? 'ASC' : 'DESC');
    const sortColumn =
      sortBy === 'code'
        ? 'bilty.code'
        : sortBy === 'issueDate'
          ? 'bilty.issueDate'
          : 'bilty.createdAt';

    const idsQb = this.biltyRepo
      .createQueryBuilder('bilty')
      .select('bilty.id', 'id')
      .addSelect('bilty.createdAt', 'createdAt')
      .addSelect('bilty.code', 'code')
      .addSelect('bilty.issueDate', 'issueDate')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('bilty.createdAt', 'DESC')
      .offset(skip)
      .limit(limit);

    applyListJoins(idsQb);
    applyFilters(idsQb);

    const idRows = await idsQb.getRawMany<{ id: string }>();
    const ids = idRows.map((row) => row.id);

    const countQb = this.biltyRepo.createQueryBuilder('bilty');
    applyListJoins(countQb);
    applyFilters(countQb);
    const total = await countQb.getCount();

    if (!ids.length) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

    const rows = await this.biltyRepo.find({
      where: { id: In(ids) },
      relations: {
        driver: { user: true },
        broker: true,
        transporter: true,
        transportationProduct: true,
        vehicle: true,
        createdBy: true,
        loadings: { client: true, pickupLocation: true },
        offLoadings: { client: true, dropoffLocation: true },
      },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const tripsByBiltyId = await this.findTripsByBiltyIds(ids);
    const data = ids
      .map((id) => byId.get(id))
      .filter((row): row is Bilty => !!row)
      .map((row) => {
        row.loadings = [...(row.loadings ?? [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        row.offLoadings = [...(row.offLoadings ?? [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return this.toListResponse(row, tripsByBiltyId.get(row.id) ?? []);
      });

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

  async findOne(id: string) {
    const bilty = await this.findByIdOrFail(id);
    const trips = (await this.findTripsByBiltyIds([bilty.id])).get(id) ?? [];
    const primary = trips[0] ?? null;
    return Object.assign(bilty, {
      trips,
      tripId: primary?.id ?? null,
      trip: primary,
    });
  }

  /**
   * Public lookup by bilty code (e.g. ZS000001) or UUID.
   * No auth. Returns a sanitized payload + print copy marks.
   */
  async findPublic(codeOrId: string) {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Bilty not found');
    }

    let bilty: Bilty | null;
    if (isUuid) {
      bilty = await this.loadBiltyRelations({ id: key });
    } else {
      bilty = await this.loadBiltyRelations({ code: key.toUpperCase() });
    }

    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return this.toPublicResponse(bilty);
  }

  async getPublicQrPng(codeOrId: string) {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Bilty not found');
    }

    let bilty: Bilty | null;
    if (isUuid) {
      bilty = await this.loadBiltyRelations({ id: key });
    } else {
      bilty = await this.loadBiltyRelations({ code: key.toUpperCase() });
    }
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }

    const links = buildPublicApiLinks('biltys', bilty.code);
    const buffer = await buildCode128PngBuffer(bilty.code, {
      scale: 3,
      height: 12,
      includetext: true,
    });
    return {
      buffer,
      filename: `${bilty.code}-barcode.png`,
      code: bilty.code,
      publicUrl: links.publicUrl,
    };
  }

  async update(
    id: string,
    dto: UpdateBiltyDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.findByIdOrFail(id);

    if (dto.driverId !== undefined) {
      await this.ensureDriver(dto.driverId);
      bilty.driverId = dto.driverId;
    }
    if (dto.brokerId !== undefined) {
      bilty.brokerId = await this.resolvePartyClientId(
        dto.brokerId,
        ClientCategory.BROKER,
        'brokerId',
      );
    }
    if (dto.transportationProductId !== undefined) {
      bilty.transportationProductId =
        await this.resolveTransportationProductId(dto.transportationProductId);
    }
    if (dto.transporterId !== undefined) {
      const nextTransporter = await this.resolvePartyClient(
        dto.transporterId,
        ClientCategory.TRANSPORTER,
        'transporterId',
      );
      if (!nextTransporter) {
        // Transporter null/empty → clear id + name + phone together.
        bilty.transporterId = null;
        bilty.transporterName = null;
        bilty.transporterPhone = null;
      } else {
        bilty.transporterId = nextTransporter.id;
        if (this.pickTransporterName(dto) === undefined) {
          bilty.transporterName = nextTransporter.companyName;
        }
        if (this.pickTransporterPhone(dto) === undefined) {
          bilty.transporterPhone = this.nullableTrim(nextTransporter.ptclNo);
        }
      }
    }
    if (
      dto.vehicleId !== undefined ||
      dto.vehicleRegistrationNumber !== undefined
    ) {
      let nextVehicleId =
        dto.vehicleId !== undefined ? dto.vehicleId : bilty.vehicleId;
      let nextRegistration =
        dto.vehicleRegistrationNumber !== undefined
          ? dto.vehicleRegistrationNumber
          : bilty.vehicleRegistrationNumber;

      // Selecting a fleet vehicle clears free-text unless both are sent.
      if (dto.vehicleId && dto.vehicleRegistrationNumber === undefined) {
        nextRegistration = null;
      }
      // Entering free-text clears the fleet link unless vehicleId is also sent.
      if (
        dto.vehicleRegistrationNumber &&
        dto.vehicleId === undefined
      ) {
        nextVehicleId = null;
      }

      const vehicleFields = await this.resolveVehicleFields(
        nextVehicleId,
        nextRegistration,
        false,
      );
      bilty.vehicleId = vehicleFields.vehicleId;
      bilty.vehicleRegistrationNumber =
        vehicleFields.vehicleRegistrationNumber;
    }
    if (dto.issueDate !== undefined) {
      bilty.issueDate = dto.issueDate.slice(0, 10) as unknown as Date;
    }
    if (dto.loadType !== undefined) {
      bilty.loadType = dto.loadType;
    }
    if (dto.estimatedHours !== undefined) {
      bilty.estimatedHours = dto.estimatedHours;
    }
    if (dto.odometer !== undefined) {
      bilty.odometer = dto.odometer;
    }
    if (dto.description !== undefined) {
      bilty.description = this.nullableTrim(dto.description);
    }
    if (dto.remarks !== undefined) {
      bilty.remarks = this.nullableTrim(dto.remarks);
    }
    if (dto.refNumber !== undefined) {
      bilty.refNumber = this.nullableTrim(dto.refNumber);
    }
    if (dto.totalWeight !== undefined) {
      bilty.totalWeight = this.nullableTrim(dto.totalWeight);
    }
    if (dto.noOfPackages !== undefined) {
      bilty.noOfPackages = this.nullableTrim(dto.noOfPackages);
    }
    // Skip name/phone overrides when transporter was just cleared (already null).
    const transporterCleared =
      dto.transporterId !== undefined &&
      (dto.transporterId === null || dto.transporterId === '');
    if (!transporterCleared) {
      const name = this.pickTransporterName(dto);
      if (name !== undefined) {
        bilty.transporterName = this.nullableTrim(name);
      }
      const phone = this.pickTransporterPhone(dto);
      if (phone !== undefined) {
        bilty.transporterPhone = this.nullableTrim(phone);
      }
    }

    if (dto.loadings !== undefined) {
      await this.validateLoadings(dto.loadings);
    }
    if (dto.offLoadings !== undefined) {
      await this.validateOffLoadings(dto.offLoadings);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(bilty);
      if (dto.loadings !== undefined) {
        await this.replaceLoadings(manager, id, dto.loadings);
      }
      if (dto.offLoadings !== undefined) {
        await this.replaceOffLoadings(manager, id, dto.offLoadings);
      }
    });

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: id,
        record: result.code,
        description: `Updated bilty ${result.code}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeBiltyStatusDto,
    activity?: ActivityActorContext,
  ) {
    const bilty = await this.findByIdOrFail(id);
    bilty.status = dto.status;
    await this.biltyRepo.save(bilty);

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Bilty',
        entityId: id,
        record: result.code,
        description: `Changed bilty ${result.code} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );
    return result;
  }

  private async findByIdOrFail(id: string) {
    const bilty = await this.loadBiltyRelations({ id });
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return bilty;
  }

  private async loadBiltyRelations(
    where: { id: string } | { code: string },
  ): Promise<Bilty | null> {
    const bilty = await this.biltyRepo.findOne({
      where,
      relations: {
        driver: { user: true },
        broker: true,
        transporter: true,
        transportationProduct: true,
        vehicle: true,
        createdBy: true,
        loadings: {
          client: true,
          pickupLocation: true,
        },
        offLoadings: {
          client: true,
          dropoffLocation: true,
        },
      },
    });
    if (!bilty) return null;

    bilty.loadings = [...(bilty.loadings ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    bilty.offLoadings = [...(bilty.offLoadings ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return bilty;
  }

  /** Print copy marks for the same bilty document. */
  private static readonly PRINT_COPIES = [
    { key: 'OFFICE', label: 'Office Copy' },
    { key: 'TRANSPORTER', label: 'Transporter Copy' },
    { key: 'RECEIVING', label: 'Receiving Copy' },
  ] as const;

  /**
   * Trips that reference these bilties via UC/DC loads (non-cancelled), deduped.
   */
  private async findTripsByBiltyIds(
    biltyIds: string[],
  ): Promise<Map<string, BiltyTripSummary[]>> {
    const result = new Map<string, BiltyTripSummary[]>();
    if (!biltyIds.length) return result;

    for (const id of biltyIds) result.set(id, []);

    const [ucLoads, dcLoads] = await Promise.all([
      this.dataSource.getRepository(TripUpcountryLoad).find({
        where: {
          biltyId: In(biltyIds),
        },
        relations: { trip: true },
      }),
      this.dataSource.getRepository(TripDowncountryLoad).find({
        where: {
          biltyId: In(biltyIds),
        },
        relations: { trip: true },
      }),
    ]);

    const seen = new Map<string, Set<string>>(); // biltyId → tripIds
    const pushTrip = (biltyId: string, trip?: Trip | null, loadStatus?: TripLoadStatus) => {
      if (!trip || loadStatus === TripLoadStatus.CANCELLED) return;
      if (!seen.has(biltyId)) seen.set(biltyId, new Set());
      const tripIds = seen.get(biltyId)!;
      if (tripIds.has(trip.id)) return;
      tripIds.add(trip.id);
      const list = result.get(biltyId) ?? [];
      list.push({
        id: trip.id,
        tripCode: trip.tripCode,
        tripDate: trip.tripDate ?? null,
        status: trip.status,
        auditStatus: trip.auditStatus,
      });
      result.set(biltyId, list);
    };

    for (const load of ucLoads) {
      pushTrip(load.biltyId, load.trip, load.status);
    }
    for (const load of dcLoads) {
      pushTrip(load.biltyId, load.trip, load.status);
    }

    // Stable: newest tripDate first, then tripCode
    for (const [biltyId, trips] of result) {
      trips.sort((a, b) => {
        const da = a.tripDate ? new Date(a.tripDate).getTime() : 0;
        const db = b.tripDate ? new Date(b.tripDate).getTime() : 0;
        if (db !== da) return db - da;
        return String(a.tripCode).localeCompare(String(b.tripCode));
      });
      result.set(biltyId, trips);
    }

    return result;
  }

  /**
   * Shared filters for trip bilty pickers (list + utility).
   * Alias expectations: `bilty`; optional `vehicle` join for vehicle* filters.
   */
  private applyBiltyPickerFilters(
    qb: ReturnType<Repository<Bilty>['createQueryBuilder']>,
    opts: {
      status?: BiltyStatus;
      clientId?: string;
      brokerId?: string;
      transporterId?: string;
      loadType?: BiltyLoadType;
      unassigned?: boolean;
      tripId?: string;
      driverId?: string;
      vehicleId?: string;
      vehicleRegNo?: string;
      vehicleTypeId?: string;
      vehicleSizeId?: string;
      vehicleCapacityId?: string;
      search?: string;
    },
  ) {
    if (opts.status) {
      qb.andWhere('bilty.status = :pickerStatus', { pickerStatus: opts.status });
    }
    if (opts.loadType) {
      qb.andWhere('bilty.loadType = :loadType', { loadType: opts.loadType });
    }
    if (opts.brokerId) {
      qb.andWhere('bilty.brokerId = :pickerBrokerId', {
        pickerBrokerId: opts.brokerId,
      });
    }
    if (opts.transporterId) {
      qb.andWhere('bilty.transporterId = :pickerTransporterId', {
        pickerTransporterId: opts.transporterId,
      });
    }
    if (opts.driverId) {
      qb.andWhere('bilty.driverId = :pickerDriverId', {
        pickerDriverId: opts.driverId,
      });
    }
    if (opts.vehicleId) {
      qb.andWhere('bilty.vehicleId = :pickerVehicleId', {
        pickerVehicleId: opts.vehicleId,
      });
    }
    const vehicleRegNo = opts.vehicleRegNo?.trim();
    if (vehicleRegNo) {
      qb.andWhere(
        `(
          vehicle.regNo ILIKE :pickerVehicleRegNo
          OR bilty.vehicleRegistrationNumber ILIKE :pickerVehicleRegNo
        )`,
        { pickerVehicleRegNo: `%${vehicleRegNo}%` },
      );
    }
    if (opts.vehicleTypeId) {
      qb.andWhere('vehicle.vehicleTypeId = :pickerVehicleTypeId', {
        pickerVehicleTypeId: opts.vehicleTypeId,
      });
    }
    if (opts.vehicleSizeId) {
      qb.andWhere('vehicle.vehicleSizeId = :pickerVehicleSizeId', {
        pickerVehicleSizeId: opts.vehicleSizeId,
      });
    }
    if (opts.vehicleCapacityId) {
      qb.andWhere('vehicle.vehicleCapacityId = :pickerVehicleCapacityId', {
        pickerVehicleCapacityId: opts.vehicleCapacityId,
      });
    }
    if (opts.clientId) {
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM bilty_loadings l
            WHERE l."biltyId" = bilty.id AND l."clientId" = :pickerClientId
          )
          OR EXISTS (
            SELECT 1 FROM bilty_off_loadings ol
            WHERE ol."biltyId" = bilty.id AND ol."clientId" = :pickerClientId
          )
        )`,
        { pickerClientId: opts.clientId },
      );
    }

    if (opts.unassigned === true && opts.tripId) {
      // Edit trip: free biltys + those already on this trip (ignore CANCELLED loads).
      // Cast status::text — UC/DC use different PG enums; one bind can't satisfy both.
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM trip_upcountry_loads ul
          WHERE ul."biltyId" = bilty.id
            AND ul.status::text <> :pickerCancelledLoad
            AND ul."tripId" <> :pickerTripId
        )
        AND NOT EXISTS (
          SELECT 1 FROM trip_downcountry_loads dl
          WHERE dl."biltyId" = bilty.id
            AND dl.status::text <> :pickerCancelledLoad
            AND dl."tripId" <> :pickerTripId
        )`,
        {
          pickerTripId: opts.tripId,
          pickerCancelledLoad: TripLoadStatus.CANCELLED,
        },
      );
    } else if (opts.unassigned === true) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM trip_upcountry_loads ul
          WHERE ul."biltyId" = bilty.id AND ul.status::text <> :pickerCancelledLoad
        )
        AND NOT EXISTS (
          SELECT 1 FROM trip_downcountry_loads dl
          WHERE dl."biltyId" = bilty.id AND dl.status::text <> :pickerCancelledLoad
        )`,
        { pickerCancelledLoad: TripLoadStatus.CANCELLED },
      );
    } else if (opts.tripId) {
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."biltyId" = bilty.id
              AND ul."tripId" = :pickerTripId
              AND ul.status::text <> :pickerCancelledLoad
          )
          OR EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."biltyId" = bilty.id
              AND dl."tripId" = :pickerTripId
              AND dl.status::text <> :pickerCancelledLoad
          )
        )`,
        {
          pickerTripId: opts.tripId,
          pickerCancelledLoad: TripLoadStatus.CANCELLED,
        },
      );
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(bilty.refNumber ILIKE :pickerSearch OR bilty.code ILIKE :pickerSearch)',
        { pickerSearch: `%${search}%` },
      );
    }
  }

  /** List payload — includes loading/offloading client + location summary. */
  private toListResponse(bilty: Bilty, trips: BiltyTripSummary[] = []) {
    const primary = trips[0] ?? null;
    return {
      id: bilty.id,
      code: bilty.code,
      issueDate: bilty.issueDate,
      loadType: bilty.loadType,
      estimatedHours: bilty.estimatedHours ?? null,
      odometer: bilty.odometer ?? null,
      description: bilty.description,
      remarks: bilty.remarks ?? null,
      refNumber: bilty.refNumber ?? null,
      totalWeight: bilty.totalWeight ?? null,
      noOfPackages: bilty.noOfPackages ?? null,
      transporterName: bilty.transporterName ?? null,
      transporterPhone: bilty.transporterPhone ?? null,
      // Legacy FE keys
      transaportorName: bilty.transporterName ?? null,
      transaportorPhone: bilty.transporterPhone ?? null,
      status: bilty.status,
      driverId: bilty.driverId,
      brokerId: bilty.brokerId ?? null,
      transporterId: bilty.transporterId ?? null,
      transportationProductId: bilty.transportationProductId ?? null,
      vehicleId: bilty.vehicleId ?? null,
      vehicleRegistrationNumber: bilty.vehicleRegistrationNumber ?? null,
      trips,
      tripId: primary?.id ?? null,
      trip: primary,
      createdById: bilty.createdById ?? null,
      createdAt: bilty.createdAt,
      updatedAt: bilty.updatedAt,
      driver: bilty.driver
        ? {
            id: bilty.driver.id,
            driverType: bilty.driver.driverType,
            phone: bilty.driver.phone ?? null,
            user: bilty.driver.user
              ? {
                  id: bilty.driver.user.id,
                  name: bilty.driver.user.name,
                }
              : null,
          }
        : null,
      broker: this.toPartyClientSummary(bilty.broker),
      transporter: this.toPartyClientSummary(bilty.transporter),
      transportationProduct: bilty.transportationProduct
        ? {
            id: bilty.transportationProduct.id,
            name: bilty.transportationProduct.name,
            status: bilty.transportationProduct.status,
          }
        : null,
      vehicle: bilty.vehicle
        ? {
            id: bilty.vehicle.id,
            regNo: bilty.vehicle.regNo,
            status: bilty.vehicle.status,
          }
        : null,
      vehicleNo:
        bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber ?? null,
      createdBy: bilty.createdBy
        ? {
            id: bilty.createdBy.id,
            name: bilty.createdBy.name,
          }
        : null,
      loadings: (bilty.loadings ?? []).map((row) => ({
        id: row.id,
        clientId: row.clientId,
        pickupLocationId: row.pickupLocationId,
        departureDateTime: row.departureDateTime,
        loadingArrivalDateTime: row.loadingArrivalDateTime ?? null,
        clientName: row.client?.companyName ?? null,
        locationName: row.pickupLocation?.name ?? null,
        locationAddress: row.pickupLocation?.address ?? null,
        client: row.client
          ? {
              id: row.client.id,
              companyName: row.client.companyName,
            }
          : null,
        pickupLocation: row.pickupLocation
          ? {
              id: row.pickupLocation.id,
              name: row.pickupLocation.name,
              address: row.pickupLocation.address,
            }
          : null,
      })),
      offLoadings: (bilty.offLoadings ?? []).map((row) => ({
        id: row.id,
        clientId: row.clientId,
        dropoffLocationId: row.dropoffLocationId,
        offLoadingDateTime: row.offLoadingDateTime ?? null,
        offLoadingArrivalDateTime: row.offLoadingArrivalDateTime ?? null,
        clientName: row.client?.companyName ?? null,
        locationName: row.dropoffLocation?.name ?? null,
        locationAddress: row.dropoffLocation?.address ?? null,
        client: row.client
          ? {
              id: row.client.id,
              companyName: row.client.companyName,
            }
          : null,
        dropoffLocation: row.dropoffLocation
          ? {
              id: row.dropoffLocation.id,
              name: row.dropoffLocation.name,
              address: row.dropoffLocation.address,
            }
          : null,
      })),
    };
  }

  private toPublicResponse(bilty: Bilty) {
    const driverUser = bilty.driver?.user;
    const links = buildPublicApiLinks('biltys', bilty.code);
    return {
      id: bilty.id,
      code: bilty.code,
      issueDate: bilty.issueDate,
      estimatedHours: bilty.estimatedHours ?? null,
      odometer: bilty.odometer ?? null,
      description: bilty.description,
      remarks: bilty.remarks ?? null,
      refNumber: bilty.refNumber ?? null,
      totalWeight: bilty.totalWeight ?? null,
      noOfPackages: bilty.noOfPackages ?? null,
      transporterName: bilty.transporterName ?? null,
      transporterPhone: bilty.transporterPhone ?? null,
      // Legacy FE keys
      transaportorName: bilty.transporterName ?? null,
      transaportorPhone: bilty.transporterPhone ?? null,
      status: bilty.status,
      createdAt: bilty.createdAt,
      updatedAt: bilty.updatedAt,
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      /** Same bilty printed 3 times with these marks. */
      printCopies: BiltysService.PRINT_COPIES.map((c) => ({ ...c })),
      createdBy: bilty.createdBy
        ? {
            id: bilty.createdBy.id,
            name: bilty.createdBy.name,
          }
        : null,
      driver: bilty.driver
        ? {
            id: bilty.driver.id,
            driverType: bilty.driver.driverType,
            phone: bilty.driver.phone ?? null,
            licenseNo: bilty.driver.licenseNo ?? null,
            user: driverUser
              ? {
                  id: driverUser.id,
                  name: driverUser.name,
                  phone: driverUser.phone ?? null,
                }
              : null,
          }
        : null,
      broker: this.toPartyClientSummary(bilty.broker),
      transporter: this.toPartyClientSummary(bilty.transporter),
      transportationProduct: bilty.transportationProduct
        ? {
            id: bilty.transportationProduct.id,
            name: bilty.transportationProduct.name,
            status: bilty.transportationProduct.status,
          }
        : null,
      vehicle: bilty.vehicle
        ? {
            id: bilty.vehicle.id,
            regNo: bilty.vehicle.regNo,
            ownership: bilty.vehicle.ownership,
            status: bilty.vehicle.status,
          }
        : null,
      vehicleRegistrationNumber: bilty.vehicleRegistrationNumber ?? null,
      vehicleNo:
        bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber ?? null,
      loadings: (bilty.loadings ?? []).map((row) => ({
        id: row.id,
        departureDateTime: row.departureDateTime,
        loadingArrivalDateTime: row.loadingArrivalDateTime ?? null,
        loadingContactName: row.loadingContactName ?? null,
        loadingContactPhone: row.loadingContactPhone ?? null,
        noOfLoadingStops: row.noOfLoadingStops ?? null,
        stopsContact: row.stopsContact ?? null,
        client: row.client
          ? {
              id: row.client.id,
              companyName: row.client.companyName,
              companyAddress: row.client.companyAddress,
              email: row.client.email,
            }
          : null,
        pickupLocation: row.pickupLocation
          ? {
              id: row.pickupLocation.id,
              name: row.pickupLocation.name,
              address: row.pickupLocation.address,
              contactPersonName: row.pickupLocation.contactPersonName ?? null,
              contactPersonPhone: row.pickupLocation.contactPersonPhone ?? null,
            }
          : null,
      })),
      offLoadings: (bilty.offLoadings ?? []).map((row) => ({
        id: row.id,
        offLoadingDateTime: row.offLoadingDateTime ?? null,
        offLoadingArrivalDateTime: row.offLoadingArrivalDateTime ?? null,
        offLoadingContactName: row.offLoadingContactName ?? null,
        offLoadingContactPhone: row.offLoadingContactPhone ?? null,
        noOfOffLoadingStops: row.noOfOffLoadingStops ?? null,
        stopsContact: row.stopsContact ?? null,
        client: row.client
          ? {
              id: row.client.id,
              companyName: row.client.companyName,
              companyAddress: row.client.companyAddress,
              email: row.client.email,
            }
          : null,
        dropoffLocation: row.dropoffLocation
          ? {
              id: row.dropoffLocation.id,
              name: row.dropoffLocation.name,
              address: row.dropoffLocation.address,
              contactPersonName: row.dropoffLocation.contactPersonName ?? null,
              contactPersonPhone:
                row.dropoffLocation.contactPersonPhone ?? null,
            }
          : null,
      })),
    };
  }

  private async ensureDriver(driverId: string) {
    const exists = await this.driverRepo.exist({ where: { id: driverId } });
    if (!exists) {
      throw new BadRequestException('Driver not found');
    }
  }

  /**
   * Optional bilty party: client uuid with the expected category.
   * Empty/null clears the link.
   */
  private async resolvePartyClient(
    value: string | null | undefined,
    category: ClientCategory.BROKER | ClientCategory.TRANSPORTER,
    field: 'brokerId' | 'transporterId',
  ): Promise<Client | null> {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const client = await this.clientRepo.findOne({ where: { id: value } });
    if (!client) {
      throw new BadRequestException(`${field}: client not found`);
    }
    if (client.category !== category) {
      throw new BadRequestException(
        `${field} must be a client with category ${category}`,
      );
    }
    if (client.status === ClientStatus.INACTIVE) {
      throw new BadRequestException(`${field}: client is inactive`);
    }
    return client;
  }

  private async resolvePartyClientId(
    value: string | null | undefined,
    category: ClientCategory.BROKER | ClientCategory.TRANSPORTER,
    field: 'brokerId' | 'transporterId',
  ): Promise<string | null> {
    const client = await this.resolvePartyClient(value, category, field);
    return client?.id ?? null;
  }

  private toPartyClientSummary(client?: Client | null) {
    if (!client) return null;
    return {
      id: client.id,
      companyName: client.companyName,
      email: client.email ?? null,
      status: client.status,
      category: client.category,
    };
  }

  private async ensureTransportationProduct(id: string) {
    const exists = await this.transportationProductRepo.exist({
      where: { id },
    });
    if (!exists) {
      throw new NotFoundException('Transportation product not found');
    }
  }

  private async resolveTransportationProductId(
    transportationProductId?: string | null,
  ): Promise<string | null> {
    if (
      transportationProductId === undefined ||
      transportationProductId === null ||
      transportationProductId === ''
    ) {
      return null;
    }
    await this.ensureTransportationProduct(transportationProductId);
    return transportationProductId;
  }

  private async ensureVehicle(vehicleId: string) {
    const exists = await this.vehicleRepo.exist({ where: { id: vehicleId } });
    if (!exists) {
      throw new BadRequestException('Vehicle not found');
    }
  }

  /**
   * Accept either a fleet `vehicleId` or a free-text registration number.
   * On create, at least one is required.
   */
  private async resolveVehicleFields(
    vehicleId?: string | null,
    vehicleRegistrationNumber?: string | null,
    requireAtLeastOne = true,
  ): Promise<{
    vehicleId: string | null;
    vehicleRegistrationNumber: string | null;
  }> {
    const normalizedId =
      vehicleId === undefined || vehicleId === null || vehicleId === ''
        ? null
        : vehicleId;
    const normalizedReg = this.nullableTrim(vehicleRegistrationNumber);

    if (requireAtLeastOne && !normalizedId && !normalizedReg) {
      throw new BadRequestException(
        'Either vehicleId or vehicleRegistrationNumber is required',
      );
    }

    if (normalizedId) {
      await this.ensureVehicle(normalizedId);
    }

    return {
      vehicleId: normalizedId,
      vehicleRegistrationNumber: normalizedReg,
    };
  }

  private async validateLoadings(loadings: CreateBiltyLoadingDto[]) {
    for (const item of loadings) {
      const client = await this.clientRepo.exist({
        where: { id: item.clientId },
      });
      if (!client) {
        throw new BadRequestException(
          `Client not found: ${item.clientId}`,
        );
      }

      const pickup = await this.pickupRepo.findOne({
        where: { id: item.pickupLocationId },
      });
      if (!pickup) {
        throw new BadRequestException(
          `Pickup location not found: ${item.pickupLocationId}`,
        );
      }
      if (pickup.clientId !== item.clientId) {
        throw new BadRequestException(
          'Pickup location does not belong to the selected client',
        );
      }
    }
  }

  private async validateOffLoadings(offLoadings: CreateBiltyOffLoadingDto[]) {
    for (const item of offLoadings) {
      const client = await this.clientRepo.exist({
        where: { id: item.clientId },
      });
      if (!client) {
        throw new BadRequestException(
          `Client not found: ${item.clientId}`,
        );
      }

      const dropoff = await this.dropoffRepo.findOne({
        where: { id: item.dropoffLocationId },
      });
      if (!dropoff) {
        throw new BadRequestException(
          `Dropoff location not found: ${item.dropoffLocationId}`,
        );
      }
      if (dropoff.clientId !== item.clientId) {
        throw new BadRequestException(
          'Dropoff location does not belong to the selected client',
        );
      }
    }
  }

  private async replaceLoadings(
    manager: EntityManager,
    biltyId: string,
    loadings: CreateBiltyLoadingDto[],
  ) {
    await manager.delete(BiltyLoading, { biltyId });
    if (!loadings.length) return;

    await manager.save(
      loadings.map((item) =>
        manager.create(BiltyLoading, {
          biltyId,
          clientId: item.clientId,
          departureDateTime: this.toOptionalDate(item.departureDateTime),
          loadingArrivalDateTime: this.toOptionalDate(
            item.loadingArrivalDateTime,
          ),
          pickupLocationId: item.pickupLocationId,
          loadingContactName: this.nullableTrim(item.loadingContactName),
          loadingContactPhone: this.nullableTrim(item.loadingContactPhone),
          noOfLoadingStops: this.nullableInt(item.noOfLoadingStops),
          stopsContact: this.normalizeStopsContact(item.stopsContact),
        }),
      ),
    );
  }

  private async replaceOffLoadings(
    manager: EntityManager,
    biltyId: string,
    offLoadings: CreateBiltyOffLoadingDto[],
  ) {
    await manager.delete(BiltyOffLoading, { biltyId });
    if (!offLoadings.length) return;

    await manager.save(
      offLoadings.map((item) =>
        manager.create(BiltyOffLoading, {
          biltyId,
          clientId: item.clientId,
          offLoadingDateTime: this.toOptionalDate(item.offLoadingDateTime),
          offLoadingArrivalDateTime: this.toOptionalDate(
            item.offLoadingArrivalDateTime,
          ),
          dropoffLocationId: item.dropoffLocationId,
          offLoadingContactName: this.nullableTrim(
            item.offLoadingContactName,
          ),
          offLoadingContactPhone: this.nullableTrim(
            item.offLoadingContactPhone,
          ),
          noOfOffLoadingStops: this.nullableInt(item.noOfOffLoadingStops),
          stopsContact: this.normalizeStopsContact(item.stopsContact),
        }),
      ),
    );
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.biltyRepo,
        BILTY_CODE_PREFIX,
        'code',
        BILTY_CODE_PAD,
        attempt,
      );
      const existing = await this.biltyRepo.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    throw new BadRequestException('Could not generate unique bilty code');
  }

  /**
   * ZS/MON/DDYY/{serialWithoutZS}
   * e.g. issueDate 2026-08-31 + ZS-00001 → ZS/AUG/3126/00001
   */
  private buildRefNumber(code: string, issueDate: string): string {
    const [yearStr, monthStr, dayStr] = issueDate.slice(0, 10).split('-');
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ] as const;
    const monthIndex = Number.parseInt(monthStr, 10) - 1;
    const mon = months[monthIndex] ?? 'JAN';
    const dd = dayStr.padStart(2, '0');
    const yy = yearStr.slice(-2);
    const serial = code.startsWith(BILTY_CODE_PREFIX)
      ? code.slice(BILTY_CODE_PREFIX.length)
      : code;
    return `ZS/${mon}/${dd}${yy}/${serial}`;
  }

  /** Prefer correct spelling; fall back to legacy FE typo. */
  private pickTransporterName(
    dto: CreateBiltyDto | UpdateBiltyDto,
  ): string | null | undefined {
    if (dto.transporterName !== undefined) return dto.transporterName;
    if (dto.transaportorName !== undefined) return dto.transaportorName;
    return undefined;
  }

  private pickTransporterPhone(
    dto: CreateBiltyDto | UpdateBiltyDto,
  ): string | null | undefined {
    if (dto.transporterPhone !== undefined) return dto.transporterPhone;
    if (dto.transaportorPhone !== undefined) return dto.transaportorPhone;
    return undefined;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private nullableInt(value?: number | null): number | null {
    if (value === undefined || value === null) return null;
    return value;
  }

  private toOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return new Date(value);
  }

  /** YYYY-MM-DD only (no time component). */
  private isDateOnly(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  }

  /**
   * Range lower bound for timestamp filters.
   * Date-only → that calendar day 00:00; datetime → ISO instant.
   */
  private toRangeStart(value: string): string {
    const v = value.trim();
    if (this.isDateOnly(v)) return v;
    return new Date(v).toISOString();
  }

  /**
   * Exclusive upper bound (`<`) for timestamp filters.
   * Date-only → next calendar day (includes full end day);
   * datetime → 1ms after the given instant (inclusive end).
   */
  private toRangeEndExclusive(value: string): string {
    const v = value.trim();
    if (this.isDateOnly(v)) {
      const [y, m, d] = v.split('-').map((p) => Number.parseInt(p, 10));
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      return next.toISOString().slice(0, 10);
    }
    const dt = new Date(v);
    dt.setTime(dt.getTime() + 1);
    return dt.toISOString();
  }

  private normalizeStopsContact(
    value?: {
      name?: string | null;
      phone?: string | null;
      address?: string | null;
    }[] | null,
  ): { name: string; phone: string; address: string }[] | null {
    if (value === undefined || value === null) return null;
    const normalized = value
      .map((item) => ({
        name: (item.name ?? '').trim(),
        phone: (item.phone ?? '').trim(),
        address: (item.address ?? '').trim(),
      }))
      .filter(
        (item) =>
          item.name.length > 0 ||
          item.phone.length > 0 ||
          item.address.length > 0,
      );
    return normalized.length ? normalized : null;
  }
}
