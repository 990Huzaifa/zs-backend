import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import {
  ChangeDriverStatusDto,
  CreateDriverDto,
  DriverListQueryDto,
  UpdateDriverDto,
  UploadDriverDocumentDto,
} from '../auth/dto/driver.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Driver,
  DriverDocument,
  DriverStatus,
} from '../database/entities/driver.entity';
import { ChartOfAccountKind } from '../database/entities/chart-of-account.entity';
import { Role } from '../database/entities/role.entity';
import { ProfileType, User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';

type SafeUser = Omit<User, 'password'>;

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private readonly documentRepo: Repository<DriverDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateDriverDto, activity?: ActivityActorContext) {
    const email = dto.email?.trim()
      ? dto.email.toLowerCase().trim()
      : null;
    if (email) {
      const existing = await this.userRepo.findOne({ where: { email } });
      if (existing) {
        throw new ConflictException('Email already registered');
      }
    }

    const role = await this.resolveDriverRole(dto.roleId);
    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : null;
    const code = await this.generateUniqueUserCode();
    const phone = dto.phone?.trim() || null;
    const driverName = dto.name.trim();

    const savedDriverId = await this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          name: driverName,
          email,
          password: hashedPassword,
          phone,
          profileType: ProfileType.DRIVER,
          role,
          roleId: role.id,
          code,
          isEmailVerified: Boolean(email),
        }),
      );

      const driver = await manager.save(
        manager.create(Driver, {
          userId: user.id,
          driverType: dto.driverType,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
          fatherName: dto.fatherName.trim(),
          phone,
          altPhone: dto.altPhone?.trim() || null,
          cnicNo: dto.cnicNo?.trim() || null,
          licenseNo: dto.licenseNo?.trim() || null,
          licenseType: dto.licenseType,
          currentAddress: dto.currentAddress?.trim() || null,
          permenantAddress: dto.permenantAddress?.trim() || null,
          gurantorName: dto.gurantorName?.trim() || null,
          gurantorPhone: dto.gurantorPhone?.trim() || null,
          gurantorAddress: dto.gurantorAddress?.trim() || null,
          gurantorCNIC: dto.gurantorCNIC?.trim() || null,
          avatar: null,
          status: dto.status ?? DriverStatus.ACTIVE,
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.DRIVER_PAYABLES,
          name: driverName,
          userId: user.id,
          accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        },
        manager,
      );

      return driver.id;
    });

    const result = await this.findOne(savedDriverId);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.TRIPS,
        entityType: 'Driver',
        entityId: result.id,
        record: driverName,
        description: `Created driver ${driverName}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query: DriverListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.driverRepo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .orderBy('driver.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('driver.status = :status', { status: query.status });
    }
    if (query.driverType) {
      qb.andWhere('driver.driverType = :driverType', {
        driverType: query.driverType,
      });
    }
    if (query.licenseType) {
      qb.andWhere('driver.licenseType = :licenseType', {
        licenseType: query.licenseType,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.name ILIKE :search
          OR user.email ILIKE :search
          OR user.phone ILIKE :search
          OR user.code ILIKE :search
          OR driver.fatherName ILIKE :search
          OR driver.phone ILIKE :search
          OR driver.cnicNo ILIKE :search
          OR driver.licenseNo ILIKE :search
          OR driver.gurantorName ILIKE :search
          OR driver.gurantorCNIC ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((driver) => this.toDriverResponse(driver)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const driver = await this.findByIdOrFail(id);
    return {
      ...this.toDriverResponse(driver),
      documents: (driver.documents ?? []).map((doc) =>
        this.toDocumentResponse(doc),
      ),
      assignedVehicles: (driver.assignedVehicles ?? []).map((av) => ({
        id: av.id,
        driverId: av.driverId,
        vehicleId: av.vehicleId,
        assignedDate: av.assignedDate ?? null,
        status: av.status,
        name: av.name ?? null,
        phone: av.phone ?? null,
        address: av.address ?? null,
        vehicle: av.vehicle
          ? {
              id: av.vehicle.id,
              regNo: av.vehicle.regNo,
              ownership: av.vehicle.ownership,
              status: av.vehicle.status,
            }
          : null,
        createdAt: av.createdAt,
        updatedAt: av.updatedAt,
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateDriverDto,
    activity?: ActivityActorContext,
  ) {
    const driver = await this.findByIdOrFail(id);
    const user = driver.user;

    if (dto.email !== undefined) {
      const email = dto.email?.trim()
        ? dto.email.toLowerCase().trim()
        : null;
      if (email && email !== user.email) {
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing && existing.id !== user.id) {
          throw new ConflictException('Email already registered');
        }
      }
      user.email = email;
      if (!email) {
        user.isEmailVerified = false;
      }
    }

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.password !== undefined) {
      user.password = dto.password
        ? await bcrypt.hash(dto.password, 10)
        : null;
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone?.trim() || null;
      user.phone = phone;
      driver.phone = phone;
    }

    if (dto.driverType !== undefined) driver.driverType = dto.driverType;
    if (dto.joiningDate !== undefined) {
      driver.joiningDate = dto.joiningDate
        ? new Date(dto.joiningDate)
        : null;
    }
    if (dto.fatherName !== undefined) {
      driver.fatherName = dto.fatherName.trim();
    }
    if (dto.altPhone !== undefined) {
      driver.altPhone = dto.altPhone?.trim() || null;
    }
    if (dto.cnicNo !== undefined) {
      driver.cnicNo = dto.cnicNo?.trim() || null;
    }
    if (dto.licenseNo !== undefined) {
      driver.licenseNo = dto.licenseNo?.trim() || null;
    }
    if (dto.licenseType !== undefined) driver.licenseType = dto.licenseType;
    if (dto.currentAddress !== undefined) {
      driver.currentAddress = dto.currentAddress?.trim() || null;
    }
    if (dto.permenantAddress !== undefined) {
      driver.permenantAddress = dto.permenantAddress?.trim() || null;
    }
    if (dto.gurantorName !== undefined) {
      driver.gurantorName = dto.gurantorName?.trim() || null;
    }
    if (dto.gurantorPhone !== undefined) {
      driver.gurantorPhone = dto.gurantorPhone?.trim() || null;
    }
    if (dto.gurantorAddress !== undefined) {
      driver.gurantorAddress = dto.gurantorAddress?.trim() || null;
    }
    if (dto.gurantorCNIC !== undefined) {
      driver.gurantorCNIC = dto.gurantorCNIC?.trim() || null;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(user);
      await manager.save(driver);
    });

    const result = await this.findOne(id);
    const record = result.user?.name ?? id;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Driver',
        entityId: id,
        record,
        description: `Updated driver ${record}`,
      },
      activity,
    );
    return result;
  }

  async changeStatus(
    id: string,
    dto: ChangeDriverStatusDto,
    activity?: ActivityActorContext,
  ) {
    const driver = await this.findByIdOrFail(id);
    driver.status = dto.status;
    await this.driverRepo.save(driver);
    const result = await this.findOne(id);
    const record = result.user?.name ?? id;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Driver',
        entityId: id,
        record,
        description: `Changed driver ${record} status to ${dto.status}`,
      },
      activity,
    );
    return result;
  }

  async listDocuments(driverId: string) {
    await this.findByIdOrFail(driverId);
    const docs = await this.documentRepo.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((doc) => this.toDocumentResponse(doc));
  }

  async uploadDocument(
    driverId: string,
    dto: UploadDriverDocumentDto,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    await this.findByIdOrFail(driverId);

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `drivers/${driverId}/documents/${randomUUID()}${ext}`;

    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        driverId,
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
        entityType: 'DriverDocument',
        entityId: doc.id,
        record,
        description: `Uploaded driver document ${record}`,
        metadata: { driverId, docType: doc.docType },
      },
      activity,
    );
    return result;
  }

  async removeDocument(
    driverId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    await this.findByIdOrFail(driverId);
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, driverId },
    });
    if (!doc) {
      throw new NotFoundException('Driver document not found');
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
        entityType: 'DriverDocument',
        entityId: documentId,
        record,
        description: `Deleted driver document ${record}`,
        metadata: { driverId },
      },
      activity,
    );
    return { message: 'Driver document deleted' };
  }

  async uploadAvatar(
    driverId: string,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image');
    }

    const driver = await this.findByIdOrFail(driverId);
    const previous = driver.avatar;

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `drivers/${driverId}/avatar/${randomUUID()}${ext}`;
    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    driver.avatar = key;
    await this.driverRepo.save(driver);

    if (previous) {
      try {
        await this.s3Service.deleteObject(previous);
      } catch {
        // continue
      }
    }

    const record = driver.user?.name ?? driverId;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Driver',
        entityId: driverId,
        record,
        description: `Updated avatar for driver ${record}`,
      },
      activity,
    );

    return this.findOne(driverId);
  }

  async removeAvatar(driverId: string, activity?: ActivityActorContext) {
    const driver = await this.findByIdOrFail(driverId);
    if (!driver.avatar) {
      throw new NotFoundException('Driver avatar not found');
    }

    try {
      await this.s3Service.deleteObject(driver.avatar);
    } catch {
      // continue
    }

    driver.avatar = null;
    await this.driverRepo.save(driver);

    const record = driver.user?.name ?? driverId;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'Driver',
        entityId: driverId,
        record,
        description: `Removed avatar for driver ${record}`,
      },
      activity,
    );

    return this.findOne(driverId);
  }

  private async findByIdOrFail(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({
      where: { id },
      relations: {
        user: { role: true },
        documents: true,
        assignedVehicles: { vehicle: true },
      },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  private async resolveDriverRole(roleId?: string): Promise<Role> {
    if (roleId) {
      const role = await this.roleRepo.findOne({
        where: { id: roleId, isActive: true },
      });
      if (!role) {
        throw new NotFoundException('Role not found or inactive');
      }
      return role;
    }

    const driverRole = await this.roleRepo.findOne({
      where: { code: 'DRIVER', isActive: true },
    });
    if (driverRole) {
      return driverRole;
    }

    const fallback = await this.roleRepo.findOne({
      where: { code: 'USER', isActive: true },
    });
    if (!fallback) {
      throw new NotFoundException(
        'DRIVER role not found. Run role seeder or pass roleId.',
      );
    }
    return fallback;
  }

  private async generateUniqueUserCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `USR${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.userRepo.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    return `USR${Date.now().toString(36).toUpperCase()}`;
  }

  private toSafeUser(user: User): SafeUser {
    const { password: _password, ...safe } = user;
    return safe;
  }

  private toDriverResponse(driver: Driver) {
    return {
      id: driver.id,
      userId: driver.userId,
      driverType: driver.driverType,
      joiningDate: driver.joiningDate ?? null,
      fatherName: driver.fatherName,
      phone: driver.phone ?? null,
      altPhone: driver.altPhone ?? null,
      cnicNo: driver.cnicNo ?? null,
      licenseNo: driver.licenseNo ?? null,
      licenseType: driver.licenseType,
      currentAddress: driver.currentAddress ?? null,
      permenantAddress: driver.permenantAddress ?? null,
      gurantorName: driver.gurantorName ?? null,
      gurantorPhone: driver.gurantorPhone ?? null,
      gurantorAddress: driver.gurantorAddress ?? null,
      gurantorCNIC: driver.gurantorCNIC ?? null,
      avatar: driver.avatar ?? null,
      avatarUrl: driver.avatar
        ? this.s3Service.getObjectUrl(driver.avatar)
        : null,
      status: driver.status,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      user: driver.user ? this.toSafeUser(driver.user) : null,
    };
  }

  private toDocumentResponse(doc: DriverDocument) {
    return {
      id: doc.id,
      driverId: doc.driverId,
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
}
