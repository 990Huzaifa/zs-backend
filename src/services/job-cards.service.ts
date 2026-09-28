import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
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
import { S3Service } from '../common/s3/s3.service';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../common/utils/public-link.util';
import {
  JOB_CARD_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
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

const MAX_FINDING_IMAGES = 10;
const MAX_ATTACHMENTS = 10;

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
    private readonly s3Service: S3Service,
  ) {}

  async create(dto: CreateJobCardDto, activity?: ActivityActorContext) {
    await this.ensureVehicle(dto.vehicleId);
    if (dto.driverId) await this.ensureUser(dto.driverId, 'Driver');
    if (dto.raisedById) {
      await this.ensureUser(dto.raisedById, 'Raised-by user');
    }
    await this.ensureItemAssignees(dto.items);

    const status = dto.status ?? JobCardStatus.DRAFT;
    if (status !== JobCardStatus.DRAFT && status !== JobCardStatus.OPEN) {
      throw new BadRequestException('Create status must be draft or open');
    }

    const raisedById = dto.raisedById ?? activity?.actor?.id ?? null;
    if (raisedById && !dto.raisedById) {
      await this.ensureUser(raisedById, 'Raised-by user');
    }

    const jobCardNo = await this.generateUniqueJobCardNo();

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
        raisedById,
        raiseDate: this.parseOptionalDate(dto.raiseDate) ?? new Date(),
        effectiveDate: this.parseOptionalDate(dto.effectiveDate),
        siteLocation: this.nullableTrim(dto.siteLocation),
        maintenanceScheduleId: dto.maintenanceScheduleId ?? null,
        remarks: this.nullableTrim(dto.remarks),
      }),
    );

    if (dto.items?.length) {
      await this.itemRepo.save(
        dto.items.map((item) =>
          this.itemRepo.create(this.buildItemEntity(saved.id, item)),
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
      .leftJoinAndSelect('jobCard.raisedBy', 'raisedBy')
      .leftJoinAndSelect('jobCard.items', 'items')
      .leftJoinAndSelect('items.assignedBy', 'itemAssignedBy')
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

  /** Public lookup by jobCardNo (e.g. WO-000001) or UUID. */
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
    if (dto.raisedById !== undefined) {
      if (dto.raisedById) {
        await this.ensureUser(dto.raisedById, 'Raised-by user');
      }
      jobCard.raisedById = dto.raisedById;
    }
    if (dto.maintenanceScheduleId !== undefined) {
      jobCard.maintenanceScheduleId = dto.maintenanceScheduleId;
    }
    if (dto.raiseDate !== undefined) {
      jobCard.raiseDate = this.parseOptionalDate(dto.raiseDate);
    }
    if (dto.effectiveDate !== undefined) {
      jobCard.effectiveDate = this.parseOptionalDate(dto.effectiveDate);
    }
    if (dto.siteLocation !== undefined) {
      jobCard.siteLocation = this.nullableTrim(dto.siteLocation);
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
    const s3Keys = (jobCard.items ?? []).flatMap((item) => [
      ...(item.findingImage ?? []),
      ...(item.attachment ?? []),
    ]);
    await this.deleteS3Keys(s3Keys);
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
    await this.ensureItemAssignees([dto]);

    const item = await this.itemRepo.save(
      this.itemRepo.create(this.buildItemEntity(jobCardId, dto)),
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
    if (dto.assignedById !== undefined) {
      if (dto.assignedById) {
        await this.ensureUser(dto.assignedById, 'Assigned-by user');
      }
      item.assignedById = dto.assignedById;
    }
    if (dto.findingImage !== undefined) {
      const next = this.normalizeStringArray(dto.findingImage);
      const removed = (item.findingImage ?? []).filter(
        (k) => !(next ?? []).includes(k),
      );
      await this.deleteS3Keys(removed);
      item.findingImage = next;
    }
    if (dto.completedAt !== undefined) {
      item.completedAt = this.parseOptionalDate(dto.completedAt);
    }
    if (dto.odometerReading !== undefined) {
      item.odometerReading =
        dto.odometerReading === null || dto.odometerReading === undefined
          ? null
          : this.formatOdometer(dto.odometerReading);
    }
    if (dto.attachment !== undefined) {
      const next = this.normalizeStringArray(dto.attachment);
      const removed = (item.attachment ?? []).filter(
        (k) => !(next ?? []).includes(k),
      );
      await this.deleteS3Keys(removed);
      item.attachment = next;
    }
    if (dto.note !== undefined) {
      item.note = this.nullableTrim(dto.note);
    }
    if (dto.remarks !== undefined) {
      item.remarks = this.nullableTrim(dto.remarks);
    }
    if (dto.workshopLocation !== undefined) {
      item.workshopLocation = this.nullableTrim(dto.workshopLocation);
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
    if (dto.status === JobCardFindingStatus.COMPLETED) {
      item.completedAt = item.completedAt ?? new Date();
    } else if (item.completedAt) {
      item.completedAt = null;
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

    await this.deleteS3Keys([
      ...(item.findingImage ?? []),
      ...(item.attachment ?? []),
    ]);
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

    const existing = await this.itemRepo.find({ where: { jobCardId } });
    await this.deleteS3Keys(
      existing.flatMap((item) => [
        ...(item.findingImage ?? []),
        ...(item.attachment ?? []),
      ]),
    );

    await this.ensureItemAssignees(dto.items);
    await this.itemRepo.delete({ jobCardId });

    if (dto.items.length) {
      await this.itemRepo.save(
        dto.items.map((item) =>
          this.itemRepo.create(this.buildItemEntity(jobCardId, item)),
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

  async uploadFindingImages(
    jobCardId: string,
    itemId: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    const current = item.findingImage ?? [];
    if (current.length + files.length > MAX_FINDING_IMAGES) {
      throw new BadRequestException(
        `A finding can have at most ${MAX_FINDING_IMAGES} images`,
      );
    }

    const keys: string[] = [];
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `job-cards/${jobCardId}/findings/${itemId}/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    item.findingImage = [...current, ...keys];
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Uploaded ${keys.length} finding image(s) on job card ${jobCard.jobCardNo}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async removeFindingImage(
    jobCardId: string,
    itemId: string,
    key: string,
    activity?: ActivityActorContext,
  ) {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new BadRequestException('Image key is required');
    }

    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    const current = item.findingImage ?? [];
    if (!current.includes(trimmed)) {
      throw new NotFoundException('Finding image not found');
    }

    await this.deleteS3Keys([trimmed]);
    const next = current.filter((k) => k !== trimmed);
    item.findingImage = next.length ? next : null;
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Removed finding image from job card ${jobCard.jobCardNo}`,
        metadata: { key: trimmed },
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async uploadAttachments(
    jobCardId: string,
    itemId: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one attachment file is required');
    }

    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    const current = item.attachment ?? [];
    if (current.length + files.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `A finding can have at most ${MAX_ATTACHMENTS} attachments`,
      );
    }

    const keys: string[] = [];
    for (const file of files) {
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `job-cards/${jobCardId}/attachments/${itemId}/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    item.attachment = [...current, ...keys];
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Uploaded ${keys.length} attachment(s) on job card ${jobCard.jobCardNo}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(jobCardId);
  }

  async removeAttachment(
    jobCardId: string,
    itemId: string,
    key: string,
    activity?: ActivityActorContext,
  ) {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new BadRequestException('Attachment key is required');
    }

    const jobCard = await this.findByIdOrFail(jobCardId);
    this.assertEditable(jobCard);
    const item = await this.findItemOrFail(jobCardId, itemId);

    const current = item.attachment ?? [];
    if (!current.includes(trimmed)) {
      throw new NotFoundException('Attachment not found');
    }

    await this.deleteS3Keys([trimmed]);
    const next = current.filter((k) => k !== trimmed);
    item.attachment = next.length ? next : null;
    await this.itemRepo.save(item);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MAINTENANCE,
        entityType: 'JobCardItem',
        entityId: item.id,
        record: jobCard.jobCardNo,
        description: `Removed attachment from job card ${jobCard.jobCardNo}`,
        metadata: { key: trimmed },
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
      .leftJoin('jobCard.driver', 'driver')
      .leftJoin('jobCard.raisedBy', 'raisedBy');

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
    if (query.raisedById) {
      qb.andWhere('jobCard.raisedById = :raisedById', {
        raisedById: query.raisedById,
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
          OR jobCard.siteLocation ILIKE :search
          OR vehicle.regNo ILIKE :search
          OR driver.name ILIKE :search
          OR raisedBy.name ILIKE :search
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
        raisedBy: true,
        items: { assignedBy: true },
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
        raisedBy: true,
        items: { assignedBy: true },
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

  private buildItemEntity(jobCardId: string, dto: CreateJobCardItemDto) {
    const status = dto.status ?? JobCardFindingStatus.PENDING;
    const completedAt =
      dto.completedAt !== undefined
        ? this.parseOptionalDate(dto.completedAt)
        : status === JobCardFindingStatus.COMPLETED
          ? new Date()
          : null;

    return {
      jobCardId,
      title: dto.title.trim(),
      description: this.nullableTrim(dto.description),
      status,
      assignedById: dto.assignedById ?? null,
      findingImage: this.normalizeStringArray(dto.findingImage),
      completedAt,
      odometerReading:
        dto.odometerReading === null || dto.odometerReading === undefined
          ? null
          : this.formatOdometer(dto.odometerReading),
      attachment: this.normalizeStringArray(dto.attachment),
      note: this.nullableTrim(dto.note),
      remarks: this.nullableTrim(dto.remarks),
      workshopLocation: this.nullableTrim(dto.workshopLocation),
      resolutionNotes: this.nullableTrim(dto.resolutionNotes),
    };
  }

  private async ensureItemAssignees(items?: CreateJobCardItemDto[] | null) {
    if (!items?.length) return;
    for (const item of items) {
      if (item.assignedById) {
        await this.ensureUser(item.assignedById, 'Assigned-by user');
      }
    }
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
      raiseDate: jobCard.raiseDate ?? null,
      effectiveDate: jobCard.effectiveDate ?? null,
      siteLocation: jobCard.siteLocation ?? null,
      raisedById: jobCard.raisedById ?? null,
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
      raisedBy: jobCard.raisedBy
        ? {
            id: jobCard.raisedBy.id,
            name: jobCard.raisedBy.name,
            email: jobCard.raisedBy.email,
          }
        : null,
      items: (jobCard.items ?? []).map((item) => this.toItemResponse(item)),
    };
  }

  private toItemResponse(item: JobCardItems) {
    const findingImage = item.findingImage ?? null;
    const attachment = item.attachment ?? null;
    return {
      id: item.id,
      jobCardId: item.jobCardId,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      assignedById: item.assignedById ?? null,
      assignedBy: item.assignedBy
        ? {
            id: item.assignedBy.id,
            name: item.assignedBy.name,
            email: item.assignedBy.email,
          }
        : null,
      findingImage,
      findingImageUrls: (findingImage ?? []).map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
      completedAt: item.completedAt ?? null,
      odometerReading:
        item.odometerReading != null
          ? Number(item.odometerReading).toFixed(2)
          : null,
      attachment,
      attachmentUrls: (attachment ?? []).map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
      note: item.note ?? null,
      remarks: item.remarks ?? null,
      workshopLocation: item.workshopLocation ?? null,
      resolutionNotes: item.resolutionNotes ?? null,
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

  private parseOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date value');
    }
    return d;
  }

  private normalizeStringArray(value?: string[] | null): string[] | null {
    if (value === undefined || value === null) return null;
    const cleaned = value.map((s) => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned : null;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
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

  private fileExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 10) {
      return fromName.toLowerCase();
    }
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'application/pdf') return '.pdf';
    return '';
  }
}
