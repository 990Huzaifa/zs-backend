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
import {
  BILTY_CODE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Bilty,
  BiltyLoading,
  BiltyOffLoading,
  BiltyStatus,
} from '../database/entities/bilty.entity';
import {
  Client,
  ClientDropoffLocation,
  ClientPickupLocation,
} from '../database/entities/client.entity';
import { Driver } from '../database/entities/driver.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class BiltysService {
  constructor(
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
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
          driverId: dto.driverId,
          vehicleId: vehicleFields.vehicleId,
          vehicleRegistrationNumber: vehicleFields.vehicleRegistrationNumber,
          description: dto.description.trim(),
          refNumber,
          totalWeight: this.nullableTrim(dto.totalWeight),
          noOfPackages: this.nullableTrim(dto.noOfPackages),
          transaportorName: this.nullableTrim(dto.transaportorName),
          transaportorPhone: this.nullableTrim(dto.transaportorPhone),
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

  async findAll(query: BiltyListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const applyFilters = (qb: ReturnType<Repository<Bilty>['createQueryBuilder']>) => {
      if (query.status) {
        qb.andWhere('bilty.status = :status', { status: query.status });
      }
      if (query.driverId) {
        qb.andWhere('bilty.driverId = :driverId', { driverId: query.driverId });
      }
      if (query.vehicleId) {
        qb.andWhere('bilty.vehicleId = :vehicleId', {
          vehicleId: query.vehicleId,
        });
      }

      const search = query.search?.trim();
      if (search) {
        qb.andWhere(
          `(
            bilty.code ILIKE :search
            OR bilty.description ILIKE :search
            OR bilty.refNumber ILIKE :search
            OR bilty.transaportorName ILIKE :search
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

    const idsQb = this.biltyRepo
      .createQueryBuilder('bilty')
      .select('bilty.id', 'id')
      .addSelect('bilty.createdAt', 'createdAt')
      .orderBy('bilty.createdAt', 'DESC')
      .offset(skip)
      .limit(limit);

    if (needsSearchJoins) {
      idsQb
        .leftJoin('bilty.driver', 'driver')
        .leftJoin('driver.user', 'driverUser')
        .leftJoin('bilty.vehicle', 'vehicle');
    }

    applyFilters(idsQb);

    const idRows = await idsQb.getRawMany<{ id: string }>();
    const ids = idRows.map((row) => row.id);

    const countQb = this.biltyRepo.createQueryBuilder('bilty');
    if (needsSearchJoins) {
      countQb
        .leftJoin('bilty.driver', 'driver')
        .leftJoin('driver.user', 'driverUser')
        .leftJoin('bilty.vehicle', 'vehicle');
    }
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
        vehicle: true,
        createdBy: true,
        loadings: { client: true, pickupLocation: true },
        offLoadings: { client: true, dropoffLocation: true },
      },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
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
        return this.toListResponse(row);
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
    return this.findByIdOrFail(id);
  }

  /**
   * Public lookup by bilty code (e.g. ZS000001) or UUID.
   * No auth. Returns a sanitized payload + print copy marks.
   */
  async findPublic(codeOrId: string) {
    const key = codeOrId.trim();
    if (!key) {
      throw new NotFoundException('Bilty not found');
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    let bilty: Bilty | null;
    if (uuidRe.test(key)) {
      bilty = await this.loadBiltyRelations({ id: key });
    } else {
      bilty = await this.loadBiltyRelations({ code: key.toUpperCase() });
    }

    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return this.toPublicResponse(bilty);
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
    if (dto.description !== undefined) {
      bilty.description = dto.description.trim();
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
    if (dto.transaportorName !== undefined) {
      bilty.transaportorName = this.nullableTrim(dto.transaportorName);
    }
    if (dto.transaportorPhone !== undefined) {
      bilty.transaportorPhone = this.nullableTrim(dto.transaportorPhone);
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

  /** List payload — includes loading/offloading client + location summary. */
  private toListResponse(bilty: Bilty) {
    return {
      id: bilty.id,
      code: bilty.code,
      issueDate: bilty.issueDate,
      description: bilty.description,
      refNumber: bilty.refNumber ?? null,
      totalWeight: bilty.totalWeight ?? null,
      noOfPackages: bilty.noOfPackages ?? null,
      transaportorName: bilty.transaportorName ?? null,
      transaportorPhone: bilty.transaportorPhone ?? null,
      status: bilty.status,
      driverId: bilty.driverId,
      vehicleId: bilty.vehicleId ?? null,
      vehicleRegistrationNumber: bilty.vehicleRegistrationNumber ?? null,
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
        loadingDate: row.loadingDate,
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
        offLoadingDateTime: row.offLoadingDateTime,
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
    return {
      id: bilty.id,
      code: bilty.code,
      issueDate: bilty.issueDate,
      description: bilty.description,
      refNumber: bilty.refNumber ?? null,
      totalWeight: bilty.totalWeight ?? null,
      noOfPackages: bilty.noOfPackages ?? null,
      transaportorName: bilty.transaportorName ?? null,
      transaportorPhone: bilty.transaportorPhone ?? null,
      status: bilty.status,
      createdAt: bilty.createdAt,
      updatedAt: bilty.updatedAt,
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
        loadingDate: row.loadingDate,
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
        offLoadingDateTime: row.offLoadingDateTime,
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
          loadingDate: item.loadingDate.slice(0, 10) as unknown as Date,
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
          offLoadingDateTime: this.toRequiredDate(item.offLoadingDateTime),
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
        6,
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
   * e.g. issueDate 2026-08-31 + ZS000001 → ZS/AUG/3126/000001
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

  private toRequiredDate(value: string): Date {
    return new Date(value);
  }

  private normalizeStopsContact(
    value?: { name: string; phone: string; address: string }[] | null,
  ): { name: string; phone: string; address: string }[] | null {
    if (value === undefined || value === null) return null;
    const normalized = value
      .map((item) => ({
        name: item.name.trim(),
        phone: item.phone.trim(),
        address: item.address.trim(),
      }))
      .filter(
        (item) =>
          item.name.length > 0 &&
          item.phone.length > 0 &&
          item.address.length > 0,
      );
    return normalized.length ? normalized : null;
  }
}
