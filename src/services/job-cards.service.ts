import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ChangeJobCardItemStatusDto,
  ChangeJobCardStatusDto,
  CreateJobCardDto,
  CreateJobCardItemDto,
  JobCardListQueryDto,
  ReplaceJobCardItemsDto,
  UpdateJobCardDto,
  UpdateJobCardItemDto,
} from '../auth/dto/job-card.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  JOB_CARD_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../common/utils/public-link.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  JobCard,
  JobCardFindingStatus,
  JobCardItems,
  JobCardPriority,
  JobCardStatus,
} from '../database/entities/maintenance/jobcard.entity';
import { User } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { ActivitiesService } from './activities.service';

const STATUS_TRANSITIONS: Record<JobCardStatus, JobCardStatus[]> = {
  [JobCardStatus.DRAFT]: [JobCardStatus.OPEN, JobCardStatus.CANCELLED],
  [JobCardStatus.OPEN]: [
    JobCardStatus.IN_PROGRESS,
    JobCardStatus.ON_HOLD,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.IN_PROGRESS]: [
    JobCardStatus.ON_HOLD,
    JobCardStatus.COMPLETED,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.ON_HOLD]: [
    JobCardStatus.OPEN,
    JobCardStatus.IN_PROGRESS,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.COMPLETED]: [],
  [JobCardStatus.CANCELLED]: [],
};

@Injectable()
export class JobCardsService {
  constructor(
    @InjectRepository(JobCard)
    private readonly jobCardRepo: Repository<JobCard>,
    @InjectRepository(JobCardItems)
    private readonly itemRepo: Repository<JobCardItems>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateJobCardDto, activity?: ActivityActorContext) {
    await this.ensureVehicle(dto.vehicleId);
    if (dto.driverId) await this.ensureUser(dto.driverId, 'Driver');
    if (dto.reportedById) {
      await this.ensureUser(dto.reportedById, 'Reported-by user');
    }

    const status = dto.status ?? JobCardStatus.DRAFT;
    if (status !== JobCardStatus.DRAFT && status !== JobCardStatus.OPEN) {
      throw new BadRequestException(
        'Create status must be draft or open',
      );
    }

    const jobCardNo = await this.generateUniqueJobCardNo();
    const now = new Date();

    const saved = await this.jobCardRepo.save(
      this.jobCardRepo.create({
        jobCardNo,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId ?? null,
        odometerReading: this.formatOdometer(dto.odometerReading),
        jobCardTitle: dto.jobCardTitle.trim(),
        maintenanceType: dto.maintenanceType,
        priority: dto.priority ?? JobCardPriority.MEDIUM,
        status,
        reportedById: dto.reportedById ?? null,
        reportedAt: status === JobCardStatus.OPEN ? now : null,
        maintenanceScheduleId: dto.maintenanceScheduleId ?? null,
        remarks: this.nullableTrim(dto.remarks),
      }),
    );

    if (dto.items?.length) {
      await this.itemRepo.save(
        dto.items.map((item) =>
          this.itemRepo.create({
            jobCardId: saved.id,
            title: item.title.trim(),
            description: this.nullableTrim(item.description),
            status: item.status ?? JobCardFindingStatus.OPEN,
          }),
        ),
      );
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCard',
        entityId: saved.id,
        record: saved.jobCardNo,
        description: `Created job card ${saved.jobCardNo}`,
        metadata: { status, itemCount: dto.items?.length ?? 0 },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: JobCardListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.jobCardRepo
      .createQueryBuilder('jobCard')
      .leftJoinAndSelect('jobCard.vehicle', 'vehicle')
      .leftJoinAndSelect('jobCard.driver', 'driver')
      .leftJoinAndSelect('jobCard.reportedBy', 'reportedBy')
      .leftJoinAndSelect('jobCard.items', 'items')
      .orderBy('jobCard.createdAt', 'DESC')
      .addOrderBy('items.createdAt', 'ASC')
      .skip(skip)
      .take(limit);

    this.applyListFilters(qb, query);

    const [rows, total] = await qb.getManyAndCount();
    const summary = await this.buildListSummary(query);

    return {
      data: rows.map((row) => this.toResponse(row)),
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
    return this.toResponse(await this.findByIdOrFail(id));
  }

  /** Public lookup by jobCardNo (e.g. JC000001) or UUID. */
  async findPublic(codeOrId: string) {
    return this.toResponse(await this.findByCodeOrIdOrFail(codeOrId));
  }

  async getPublicQrPng(codeOrId: string) {
    const jobCard = await this.findByCodeOrIdOrFail(codeOrId);
    const links = buildPublicApiLinks('job-cards', jobCard.jobCardNo);
    const buffer = await buildPublicQrPngBuffer('job-cards', jobCard.jobCardNo);
    return {
      buffer,
      filename: `${jobCard.jobCardNo}-qr.png`,
      jobCardNo: jobCard.jobCardNo,
      publicUrl: links.publicUrl,
    };
  }

  async update(
    id: string,
    dto: UpdateJobCardDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(id);
    this.assertEditable(jobCard);

    if (dto.vehicleId !== undefined) {
      await this.ensureVehicle(dto.vehicleId);
      jobCard.vehicleId = dto.vehicleId;
    }
    if (dto.driverId !== undefined) {
      if (dto.driverId) await this.ensureUser(dto.driverId, 'Driver');
      jobCard.driverId = dto.driverId;
    }
    if (dto.odometerReading !== undefined) {
      jobCard.odometerReading = this.formatOdometer(dto.odometerReading);
    }
    if (dto.jobCardTitle !== undefined) {
      jobCard.jobCardTitle = dto.jobCardTitle.trim();
    }
    if (dto.maintenanceType !== undefined) {
      jobCard.maintenanceType = dto.maintenanceType;
    }
    if (dto.priority !== undefined) {
      jobCard.priority = dto.priority;
    }
    if (dto.reportedById !== undefined) {
      if (dto.reportedById) {
        await this.ensureUser(dto.reportedById, 'Reported-by user');
      }
      jobCard.reportedById = dto.reportedById;
    }
    if (dto.maintenanceScheduleId !== undefined) {
      jobCard.maintenanceScheduleId = dto.maintenanceScheduleId;
    }
    if (dto.remarks !== undefined) {
      jobCard.remarks = this.nullableTrim(dto.remarks);
    }

    await this.jobCardRepo.save(jobCard);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCard',
        entityId: jobCard.id,
        record: jobCard.jobCardNo,
        description: `Updated job card ${jobCard.jobCardNo}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeJobCardStatusDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(id);
    const next = dto.status;

    if (jobCard.status === next) {
      return this.toResponse(jobCard);
    }

    const allowed = STATUS_TRANSITIONS[jobCard.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change status from ${jobCard.status} to ${next}`,
      );
    }

    if (next === JobCardStatus.CANCELLED) {
      const reason = dto.cancellationReason?.trim();
      if (!reason) {
        throw new BadRequestException(
          'cancellationReason is required when cancelling',
        );
      }
      jobCard.cancellationReason = reason;
      jobCard.cancelledAt = new Date();
    }

    const now = new Date();
    if (next === JobCardStatus.OPEN && !jobCard.reportedAt) {
      jobCard.reportedAt = now;
    }
    if (next === JobCardStatus.IN_PROGRESS && !jobCard.startedAt) {
      jobCard.startedAt = now;
    }
    if (next === JobCardStatus.COMPLETED) {
      jobCard.completedAt = now;
    }

    jobCard.status = next;
    await this.jobCardRepo.save(jobCard);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCard',
        entityId: jobCard.id,
        record: jobCard.jobCardNo,
        description: `Changed job card ${jobCard.jobCardNo} status to ${next}`,
        metadata: { status: next },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const jobCard = await this.findByIdOrFail(id);
    if (
      jobCard.status !== JobCardStatus.DRAFT &&
      jobCard.status !== JobCardStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled job cards can be deleted',
      );
    }

    const { jobCardNo } = jobCard;
    await this.jobCardRepo.remove(jobCard);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCard',
        entityId: id,
        record: jobCardNo,
        description: `Deleted job card ${jobCardNo}`,
      },
      activity,
    );

    return { id, jobCardNo, deleted: true };
  }

  // ── Items ──────────────────────────────────────────────

  async addItem(
    jobCardId: string,
    dto: CreateJobCardItemDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);

    const item = await this.itemRepo.save(
      this.itemRepo.create({
        jobCardId,
        title: dto.title.trim(),
        description: this.nullableTrim(dto.description),
        status: dto.status ?? JobCardFindingStatus.OPEN,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Added item "${item.title}" to job card ${jobCard.jobCardNo}`,
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async updateItem(
    jobCardId: string,
    itemId: string,
    dto: UpdateJobCardItemDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    if (dto.title !== undefined) item.title = dto.title.trim();
    if (dto.description !== undefined) {
      item.description = this.nullableTrim(dto.description);
    }
    if (dto.resolutionNotes !== undefined) {
      item.resolutionNotes = this.nullableTrim(dto.resolutionNotes);
    }

    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Updated item on job card ${jobCard.jobCardNo}`,
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async changeItemStatus(
    jobCardId: string,
    itemId: string,
    dto: ChangeJobCardItemStatusDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    item.status = dto.status;
    if (dto.resolutionNotes !== undefined) {
      item.resolutionNotes = this.nullableTrim(dto.resolutionNotes);
    }
    if (dto.status === JobCardFindingStatus.RESOLVED) {
      item.resolvedAt = item.resolvedAt ?? new Date();
    } else if (item.resolvedAt) {
      item.resolvedAt = null;
    }

    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Changed item status to ${dto.status} on job card ${jobCard.jobCardNo}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async removeItem(
    jobCardId: string,
    itemId: string,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);
    const title = item.title;

    await this.itemRepo.remove(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: itemId,
        record: jobCard.jobCardNo,
        description: `Removed item "${title}" from job card ${jobCard.jobCardNo}`,
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  /** Replace all findings in one shot (draft/open/in_progress/on_hold). */
  async replaceItems(
    jobCardId: string,
    dto: ReplaceJobCardItemsDto,
    activity?: ActivityActorContext,
  ) {
    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);

    await this.itemRepo.delete({ jobCardId });

    if (dto.items.length) {
      await this.itemRepo.save(
        dto.items.map((item) =>
          this.itemRepo.create({
            jobCardId,
            title: item.title.trim(),
            description: this.nullableTrim(item.description),
            status: item.status ?? JobCardFindingStatus.OPEN,
          }),
        ),
      );
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCard',
        entityId: jobCardId,
        record: jobCard.jobCardNo,
        description: `Replaced items on job card ${jobCard.jobCardNo}`,
        metadata: { itemCount: dto.items.length },
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  // ── Helpers ────────────────────────────────────────────

  private async buildListSummary(query: JobCardListQueryDto) {
    const qb = this.jobCardRepo
      .createQueryBuilder('jobCard')
      .leftJoin('jobCard.vehicle', 'vehicle')
      .leftJoin('jobCard.driver', 'driver');

    this.applyListFilters(qb, query, { ignoreStatus: true });

    qb.select(
      `COALESCE(SUM(CASE WHEN jobCard.status = :draft THEN 1 ELSE 0 END), 0)`,
      'draftCount',
    )
      .addSelect(
        `COALESCE(SUM(CASE WHEN jobCard.status = :open THEN 1 ELSE 0 END), 0)`,
        'openCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN jobCard.status = :inProgress THEN 1 ELSE 0 END), 0)`,
        'inProgressCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN jobCard.status = :onHold THEN 1 ELSE 0 END), 0)`,
        'onHoldCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN jobCard.status = :completed THEN 1 ELSE 0 END), 0)`,
        'completedCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN jobCard.status = :cancelled THEN 1 ELSE 0 END), 0)`,
        'cancelledCount',
      )
      .addSelect(`COUNT(jobCard.id)`, 'totalCount')
      .setParameter('draft', JobCardStatus.DRAFT)
      .setParameter('open', JobCardStatus.OPEN)
      .setParameter('inProgress', JobCardStatus.IN_PROGRESS)
      .setParameter('onHold', JobCardStatus.ON_HOLD)
      .setParameter('completed', JobCardStatus.COMPLETED)
      .setParameter('cancelled', JobCardStatus.CANCELLED);

    const raw = await qb.getRawOne<Record<string, string>>();

    return {
      draftCount: Number(raw?.draftCount ?? 0),
      openCount: Number(raw?.openCount ?? 0),
      inProgressCount: Number(raw?.inProgressCount ?? 0),
      onHoldCount: Number(raw?.onHoldCount ?? 0),
      completedCount: Number(raw?.completedCount ?? 0),
      cancelledCount: Number(raw?.cancelledCount ?? 0),
      totalCount: Number(raw?.totalCount ?? 0),
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<JobCard>,
    query: JobCardListQueryDto,
    opts: { ignoreStatus?: boolean } = {},
  ) {
    if (query.status && !opts.ignoreStatus) {
      qb.andWhere('jobCard.status = :status', { status: query.status });
    }
    if (query.priority) {
      qb.andWhere('jobCard.priority = :priority', {
        priority: query.priority,
      });
    }
    if (query.maintenanceType) {
      qb.andWhere('jobCard.maintenanceType = :maintenanceType', {
        maintenanceType: query.maintenanceType,
      });
    }
    if (query.vehicleId) {
      qb.andWhere('jobCard.vehicleId = :vehicleId', {
        vehicleId: query.vehicleId,
      });
    }
    if (query.driverId) {
      qb.andWhere('jobCard.driverId = :driverId', {
        driverId: query.driverId,
      });
    }
    if (query.reportedById) {
      qb.andWhere('jobCard.reportedById = :reportedById', {
        reportedById: query.reportedById,
      });
    }
    if (query.maintenanceScheduleId) {
      qb.andWhere('jobCard.maintenanceScheduleId = :maintenanceScheduleId', {
        maintenanceScheduleId: query.maintenanceScheduleId,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          jobCard.jobCardNo ILIKE :search
          OR jobCard.jobCardTitle ILIKE :search
          OR jobCard.remarks ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR driver.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private async findByIdOrFail(id: string): Promise<JobCard> {
    const jobCard = await this.jobCardRepo.findOne({
      where: { id },
      relations: {
        vehicle: true,
        driver: true,
        reportedBy: true,
        items: true,
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!jobCard) {
      throw new NotFoundException('Job card not found');
    }
    return jobCard;
  }

  private async findByCodeOrIdOrFail(codeOrId: string): Promise<JobCard> {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Job card not found');
    }

    if (isUuid) {
      return this.findByIdOrFail(key);
    }

    const jobCard = await this.jobCardRepo.findOne({
      where: { jobCardNo: key.toUpperCase() },
      relations: {
        vehicle: true,
        driver: true,
        reportedBy: true,
        items: true,
      },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!jobCard) {
      throw new NotFoundException('Job card not found');
    }
    return jobCard;
  }

  private async findItemOrFail(
    jobCardId: string,
    itemId: string,
  ): Promise<JobCardItems> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, jobCardId },
    });
    if (!item) {
      throw new NotFoundException('Job card item not found');
    }
    return item;
  }

  private assertEditable(jobCard: JobCard) {
    if (
      jobCard.status === JobCardStatus.COMPLETED ||
      jobCard.status === JobCardStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot edit a ${jobCard.status} job card`,
      );
    }
  }

  private async ensureVehicle(id: string) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async ensureUser(id: string, label: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`${label} not found`);
    }
    return user;
  }

  private async generateUniqueJobCardNo(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.jobCardRepo,
        JOB_CARD_PREFIX,
        'jobCardNo',
        6,
        attempt,
      );
      const existing = await this.jobCardRepo.findOne({
        where: { jobCardNo: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not generate unique job card number');
  }

  private toResponse(jobCard: JobCard) {
    const links = buildPublicApiLinks('job-cards', jobCard.jobCardNo);
    return {
      id: jobCard.id,
      jobCardNo: jobCard.jobCardNo,
      vehicleId: jobCard.vehicleId,
      driverId: jobCard.driverId ?? null,
      odometerReading: Number(jobCard.odometerReading).toFixed(2),
      jobCardTitle: jobCard.jobCardTitle,
      maintenanceType: jobCard.maintenanceType,
      priority: jobCard.priority,
      status: jobCard.status,
      reportedById: jobCard.reportedById ?? null,
      reportedAt: jobCard.reportedAt ?? null,
      startedAt: jobCard.startedAt ?? null,
      completedAt: jobCard.completedAt ?? null,
      cancelledAt: jobCard.cancelledAt ?? null,
      cancellationReason: jobCard.cancellationReason ?? null,
      remarks: jobCard.remarks ?? null,
      maintenanceScheduleId: jobCard.maintenanceScheduleId ?? null,
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      createdAt: jobCard.createdAt,
      updatedAt: jobCard.updatedAt,
      vehicle: jobCard.vehicle
        ? {
            id: jobCard.vehicle.id,
            regNo: jobCard.vehicle.regNo,
            ownership: jobCard.vehicle.ownership,
            status: jobCard.vehicle.status,
          }
        : null,
      driver: jobCard.driver
        ? {
            id: jobCard.driver.id,
            name: jobCard.driver.name,
            email: jobCard.driver.email,
            phone: jobCard.driver.phone ?? null,
          }
        : null,
      reportedBy: jobCard.reportedBy
        ? {
            id: jobCard.reportedBy.id,
            name: jobCard.reportedBy.name,
            email: jobCard.reportedBy.email,
          }
        : null,
      items: (jobCard.items ?? []).map((item) => this.toItemResponse(item)),
    };
  }

  private toItemResponse(item: JobCardItems) {
    return {
      id: item.id,
      jobCardId: item.jobCardId,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      resolutionNotes: item.resolutionNotes ?? null,
      resolvedAt: item.resolvedAt ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private formatOdometer(value: number): number {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('odometerReading must be >= 0');
    }
    return n;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }
}
