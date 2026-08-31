import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  ChangeVehicleStatusDto,
  CreateVehicleDto,
  RemoveVehicleImageDto,
  UpdateVehicleDto,
  UploadVehicleDocumentDto,
  VehicleListQueryDto,
} from '../auth/dto/vehicle.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Vehicle,
  VehicleCapacity,
  VehicleDocument,
  VehicleSize,
  VehicleStatus,
  VehicleType,
  VehicleTypeMeasurement,
} from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(VehicleType)
    private readonly typeRepo: Repository<VehicleType>,
    @InjectRepository(VehicleSize)
    private readonly sizeRepo: Repository<VehicleSize>,
    @InjectRepository(VehicleCapacity)
    private readonly capacityRepo: Repository<VehicleCapacity>,
    @InjectRepository(VehicleDocument)
    private readonly documentRepo: Repository<VehicleDocument>,
    private readonly s3Service: S3Service,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /**
   * Lightweight vehicle dropdown (trip create).
   * Default status ACTIVE. Optional type / size / capacity filters.
   */
  async listUtility(
    opts: {
      search?: string;
      status?: VehicleStatus;
      vehicleTypeId?: string;
      vehicleSizeId?: string;
      vehicleCapacityId?: string;
    } = {},
  ) {
    const qb = this.vehicleRepo
      .createQueryBuilder('vehicle')
      .leftJoin('vehicle.vehicleType', 'vehicleType')
      .leftJoin('vehicle.vehicleSize', 'vehicleSize')
      .leftJoin('vehicle.vehicleCapacity', 'vehicleCapacity')
      .select([
        'vehicle.id',
        'vehicle.regNo',
        'vehicle.status',
        'vehicle.ownership',
        'vehicle.vehicleTypeId',
        'vehicle.vehicleSizeId',
        'vehicle.vehicleCapacityId',
        'vehicleType.id',
        'vehicleType.name',
        'vehicleType.measurement',
        'vehicleSize.id',
        'vehicleSize.name',
        'vehicleCapacity.id',
        'vehicleCapacity.name',
      ])
      .orderBy('vehicle.regNo', 'ASC');

    qb.andWhere('vehicle.status = :status', {
      status: opts.status ?? VehicleStatus.ACTIVE,
    });

    if (opts.vehicleTypeId) {
      qb.andWhere('vehicle.vehicleTypeId = :vehicleTypeId', {
        vehicleTypeId: opts.vehicleTypeId,
      });
    }
    if (opts.vehicleSizeId) {
      qb.andWhere('vehicle.vehicleSizeId = :vehicleSizeId', {
        vehicleSizeId: opts.vehicleSizeId,
      });
    }
    if (opts.vehicleCapacityId) {
      qb.andWhere('vehicle.vehicleCapacityId = :vehicleCapacityId', {
        vehicleCapacityId: opts.vehicleCapacityId,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          vehicle.regNo ILIKE :search
          OR vehicleType.name ILIKE :search
          OR vehicleSize.name ILIKE :search
          OR vehicleCapacity.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((v) => ({
        id: v.id,
        label: v.regNo,
        regNo: v.regNo,
        status: v.status,
        ownership: v.ownership,
        vehicleTypeId: v.vehicleTypeId ?? null,
        vehicleSizeId: v.vehicleSizeId ?? null,
        vehicleCapacityId: v.vehicleCapacityId ?? null,
        vehicleType: v.vehicleType
          ? {
              id: v.vehicleType.id,
              name: v.vehicleType.name,
              measurement: v.vehicleType.measurement,
            }
          : null,
        vehicleSize: v.vehicleSize
          ? { id: v.vehicleSize.id, name: v.vehicleSize.name }
          : null,
        vehicleCapacity: v.vehicleCapacity
          ? { id: v.vehicleCapacity.id, name: v.vehicleCapacity.name }
          : null,
      })),
    };
  }

  async create(
    dto: CreateVehicleDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureUniqueRegNo(dto.regNo);
    const masters = await this.resolveMasters(
      dto.vehicleTypeId,
      dto.vehicleSizeId,
      dto.vehicleCapacityId,
    );

    const vehicle = this.vehicleRepo.create({
      ownership: dto.ownership,
      ownerFirstName: dto.ownerFirstName.trim(),
      ownerLastName: dto.ownerLastName.trim(),
      contactPersonName: dto.contactPersonName.trim(),
      contactNo: dto.contactNo.trim(),
      Designation: dto.Designation,
      regNo: dto.regNo.trim(),
      enginNo: dto.enginNo.trim(),
      chassisNo: dto.chassisNo.trim(),
      vehicleImages: null,
      vehicleTypeId: masters.vehicleTypeId,
      vehicleSizeId: masters.vehicleSizeId,
      vehicleCapacityId: masters.vehicleCapacityId,
      status: dto.status ?? VehicleStatus.ACTIVE,
    });

    const saved = await this.vehicleRepo.save(vehicle);
    const result = await this.findByIdOrFail(saved.id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'Vehicle',
        entityId: result.id,
        record: result.regNo,
        description: `Created vehicle ${result.regNo}`,
      },
      activity,
    );
    return this.toVehicleResponse(result);
  }

  async findAll(query: VehicleListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Vehicle> = {};
    if (query.status) where.status = query.status;
    if (query.ownership) where.ownership = query.ownership;
    if (query.vehicleTypeId) where.vehicleTypeId = query.vehicleTypeId;
    if (query.vehicleSizeId) where.vehicleSizeId = query.vehicleSizeId;
    if (query.vehicleCapacityId) {
      where.vehicleCapacityId = query.vehicleCapacityId;
    }

    const search = query.search?.trim();
    const whereClause: FindOptionsWhere<Vehicle>[] | FindOptionsWhere<Vehicle> =
      search
        ? [
            { ...where, regNo: ILike(`%${search}%`) },
            { ...where, enginNo: ILike(`%${search}%`) },
            { ...where, chassisNo: ILike(`%${search}%`) },
            { ...where, ownerFirstName: ILike(`%${search}%`) },
            { ...where, ownerLastName: ILike(`%${search}%`) },
            { ...where, contactPersonName: ILike(`%${search}%`) },
            { ...where, contactNo: ILike(`%${search}%`) },
          ]
        : where;

    const [data, total] = await this.vehicleRepo.findAndCount({
      where: whereClause,
      relations: {
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: data.map((v) => this.toVehicleResponse(v)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const vehicle = await this.findByIdOrFail(id);
    return {
      ...this.toVehicleResponse(vehicle),
      documents: (vehicle.documents ?? []).map((doc) =>
        this.toDocumentResponse(doc),
      ),
    };
  }

  async update(
    id: string,
    dto: UpdateVehicleDto,
    activity?: ActivityActorContext,
  ) {
    const vehicle = await this.findByIdOrFail(id);

    if (dto.regNo !== undefined) {
      const regNo = dto.regNo.trim();
      if (regNo !== vehicle.regNo) {
        await this.ensureUniqueRegNo(regNo, id);
      }
      vehicle.regNo = regNo;
    }

    const nextTypeId = dto.vehicleTypeId ?? vehicle.vehicleTypeId;
    if (!nextTypeId) {
      throw new BadRequestException('vehicleTypeId is required');
    }

    const nextSizeId =
      dto.vehicleSizeId !== undefined
        ? dto.vehicleSizeId
        : vehicle.vehicleSizeId;
    const nextCapacityId =
      dto.vehicleCapacityId !== undefined
        ? dto.vehicleCapacityId
        : vehicle.vehicleCapacityId;

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
      vehicle.vehicleTypeId = masters.vehicleTypeId;
      vehicle.vehicleSizeId = masters.vehicleSizeId;
      vehicle.vehicleCapacityId = masters.vehicleCapacityId;
    }

    if (dto.ownership !== undefined) vehicle.ownership = dto.ownership;
    if (dto.ownerFirstName !== undefined) {
      vehicle.ownerFirstName = dto.ownerFirstName.trim();
    }
    if (dto.ownerLastName !== undefined) {
      vehicle.ownerLastName = dto.ownerLastName.trim();
    }
    if (dto.contactPersonName !== undefined) {
      vehicle.contactPersonName = dto.contactPersonName.trim();
    }
    if (dto.contactNo !== undefined) vehicle.contactNo = dto.contactNo.trim();
    if (dto.Designation !== undefined) vehicle.Designation = dto.Designation;
    if (dto.enginNo !== undefined) vehicle.enginNo = dto.enginNo.trim();
    if (dto.chassisNo !== undefined) vehicle.chassisNo = dto.chassisNo.trim();

    if (dto.vehicleImages !== undefined) {
      const previous = vehicle.vehicleImages ?? [];
      const next = dto.vehicleImages;
      if (next === null) {
        await this.deleteS3Keys(previous);
        vehicle.vehicleImages = null;
      } else {
        const removed = previous.filter((key) => !next.includes(key));
        await this.deleteS3Keys(removed);
        vehicle.vehicleImages = next.length ? next : null;
      }
    }

    await this.vehicleRepo.save(vehicle);
    const result = await this.findByIdOrFail(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Vehicle',
        entityId: id,
        record: result.regNo,
        description: `Updated vehicle ${result.regNo}`,
      },
      activity,
    );
    return this.toVehicleResponse(result);
  }

  async changeStatus(
    id: string,
    dto: ChangeVehicleStatusDto,
    activity?: ActivityActorContext,
  ) {
    const vehicle = await this.findByIdOrFail(id);
    vehicle.status = dto.status;
    await this.vehicleRepo.save(vehicle);
    const result = await this.findByIdOrFail(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Vehicle',
        entityId: id,
        record: result.regNo,
        description: `Changed vehicle ${result.regNo} status to ${dto.status}`,
      },
      activity,
    );
    return this.toVehicleResponse(result);
  }

  // ── Images ────────────────────────────────────────────────

  async uploadImages(
    vehicleId: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const vehicle = await this.findByIdOrFail(vehicleId);
    const keys: string[] = [];

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `vehicles/${vehicleId}/images/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    const current = vehicle.vehicleImages ?? [];
    vehicle.vehicleImages = [...current, ...keys];
    await this.vehicleRepo.save(vehicle);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Vehicle',
        entityId: vehicleId,
        record: vehicle.regNo,
        description: `Uploaded ${keys.length} image(s) for vehicle ${vehicle.regNo}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(vehicleId);
  }

  async removeImage(
    vehicleId: string,
    dto: RemoveVehicleImageDto,
    activity?: ActivityActorContext,
  ) {
    const vehicle = await this.findByIdOrFail(vehicleId);
    const key = dto.key.trim();
    const current = vehicle.vehicleImages ?? [];
    if (!current.includes(key)) {
      throw new NotFoundException('Vehicle image not found');
    }

    await this.deleteS3Keys([key]);
    const next = current.filter((k) => k !== key);
    vehicle.vehicleImages = next.length ? next : null;
    await this.vehicleRepo.save(vehicle);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Vehicle',
        entityId: vehicleId,
        record: vehicle.regNo,
        description: `Removed image from vehicle ${vehicle.regNo}`,
        metadata: { key },
      },
      activity,
    );

    return this.findOne(vehicleId);
  }

  async listDocuments(vehicleId: string) {
    await this.findByIdOrFail(vehicleId);
    const docs = await this.documentRepo.find({
      where: { vehicleId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((doc) => this.toDocumentResponse(doc));
  }

  async uploadDocument(
    vehicleId: string,
    dto: UploadVehicleDocumentDto,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    await this.findByIdOrFail(vehicleId);

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `vehicles/${vehicleId}/documents/${randomUUID()}${ext}`;

    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        vehicleId,
        docType: dto.docType,
        validity: dto.validity ?? null,
        name: dto.name?.trim() || file.originalname || null,
        file: key,
      }),
    );

    const result = this.toDocumentResponse(doc);
    const record = result.name ?? result.docType;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleDocument',
        entityId: doc.id,
        record,
        description: `Uploaded vehicle document ${record}`,
        metadata: { vehicleId, docType: doc.docType },
      },
      activity,
    );
    return result;
  }

  async removeDocument(
    vehicleId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(vehicleId);
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, vehicleId },
    });
    if (!doc) {
      throw new NotFoundException('Vehicle document not found');
    }

    const record = doc.name ?? doc.docType;

    if (doc.file) {
      try {
        await this.s3Service.deleteObject(doc.file);
      } catch {
        // Continue DB delete even if S3 object is already gone
      }
    }

    await this.documentRepo.delete(doc.id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.TRIPS,
        entityType: 'VehicleDocument',
        entityId: documentId,
        record,
        description: `Deleted vehicle document ${record}`,
        metadata: { vehicleId },
      },
      activity,
    );
    return { message: 'Vehicle document deleted' };
  }

  private toVehicleResponse(vehicle: Vehicle) {
    const vehicleImages = vehicle.vehicleImages ?? [];
    return {
      ...vehicle,
      vehicleImages,
      vehicleImageUrls: vehicleImages.map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
    };
  }

  private async deleteS3Keys(keys: string[]) {
    for (const key of keys) {
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // continue
      }
    }
  }

  private toDocumentResponse(doc: VehicleDocument) {
    return {
      id: doc.id,
      vehicleId: doc.vehicleId,
      name: doc.name,
      docType: doc.docType,
      file: doc.file ?? null,
      fileUrl: doc.file ? this.s3Service.getObjectUrl(doc.file) : null,
      validity: doc.validity ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
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

  private async findByIdOrFail(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id },
      relations: {
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
        documents: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async ensureUniqueRegNo(regNo: string, excludeId?: string) {
    const existing = await this.vehicleRepo.findOne({
      where: { regNo: regNo.trim() },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vehicle registration number already exists');
    }
  }

  private async resolveMasters(
    vehicleTypeId: string,
    vehicleSizeId?: string | null,
    vehicleCapacityId?: string | null,
  ): Promise<{
    vehicleTypeId: string;
    vehicleSizeId: string | null;
    vehicleCapacityId: string | null;
  }> {
    const type = await this.typeRepo.findOne({
      where: { id: vehicleTypeId, isActive: true },
    });
    if (!type) {
      throw new NotFoundException('Vehicle type not found or inactive');
    }

    let sizeId: string | null = null;
    let capacityId: string | null = null;

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
      sizeId = size.id;
      capacityId = null;
    } else {
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
      capacityId = capacity.id;
      sizeId = null;
    }

    return {
      vehicleTypeId: type.id,
      vehicleSizeId: sizeId,
      vehicleCapacityId: capacityId,
    };
  }
}
