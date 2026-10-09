import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  NotificationEntityType,
  NotificationModuleCode,
  NotificationType,
} from '../common/notifications/notification.constants';
import { PusherService } from '../common/pusher/pusher.service';
import { S3Service } from '../common/s3/s3.service';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  ExportEntityType,
  ExportFormat,
  ExportJob,
  ExportJobStatus,
} from '../database/entities/export-job.entity';
import { NotificationSeverity } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { ExportHandlerRegistry } from './exports/export-handler.registry';
import { CreateExportPayload } from './exports/export.types';
import { MAX_EXPORT_RECORDS } from './exports/handlers/driver-export.handler';
import { NotificationsService } from './notifications.service';

const MAX_JOBS_PER_USER_PER_HOUR = 10;
const RETENTION_HOURS = 48;
const DOWNLOAD_URL_TTL_SECONDS = 3600;

@Injectable()
export class ExportJobsService {
  private readonly logger = new Logger(ExportJobsService.name);
  private readonly processing = new Set<string>();

  constructor(
    @InjectRepository(ExportJob)
    private readonly jobRepo: Repository<ExportJob>,
    private readonly handlerRegistry: ExportHandlerRegistry,
    private readonly s3Service: S3Service,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly pusherService: PusherService,
  ) {}

  async createJob(
    entityType: ExportEntityType,
    user: User,
    dto: CreateExportPayload,
    activity?: ActivityActorContext,
  ) {
    const handler = this.handlerRegistry.get(entityType);
    await this.assertRateLimit(user.id);

    const selectedIds =
      dto.recordIds?.filter((id) => typeof id === 'string' && id.length > 0) ??
      [];
    const useSelection = selectedIds.length > 0;

    const resolvedIds = await handler.resolveRecordIds(
      useSelection ? selectedIds : null,
      useSelection ? null : (dto.filters ?? null),
    );

    if (resolvedIds.length === 0) {
      throw new UnprocessableEntityException(handler.emptyMessage);
    }
    if (resolvedIds.length > MAX_EXPORT_RECORDS) {
      throw new UnprocessableEntityException(
        `Too many records to export (max ${MAX_EXPORT_RECORDS})`,
      );
    }

    const expiresAt = new Date(
      Date.now() + RETENTION_HOURS * 60 * 60 * 1000,
    );

    const job = await this.jobRepo.save(
      this.jobRepo.create({
        entityType,
        status: ExportJobStatus.QUEUED,
        format: dto.format,
        mode: dto.mode,
        recordIds: useSelection ? resolvedIds : null,
        filters: useSelection ? null : (dto.filters ?? null),
        recordCount: resolvedIds.length,
        createdById: user.id,
        expiresAt,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'ExportJob',
        entityId: job.id,
        record: handler.auditRecord,
        description: `${entityType} export job created (${dto.mode}/${dto.format})`,
        metadata: {
          jobId: job.id,
          entityType,
          mode: dto.mode,
          format: dto.format,
          recordCount: resolvedIds.length,
        },
      },
      activity,
    );

    setImmediate(() => {
      void this.processJob(job.id);
    });

    return this.toResponse(job);
  }

  async getJob(
    entityType: ExportEntityType,
    user: User,
    jobId: string,
  ) {
    const job = await this.findAccessibleJob(entityType, user, jobId);
    return this.toResponse(job);
  }

  async downloadJob(
    entityType: ExportEntityType,
    user: User,
    jobId: string,
  ) {
    const job = await this.findAccessibleJob(entityType, user, jobId);

    if (
      job.status === ExportJobStatus.QUEUED ||
      job.status === ExportJobStatus.PROCESSING
    ) {
      throw new ConflictException('Export is not ready yet');
    }

    if (job.status === ExportJobStatus.FAILED) {
      throw new NotFoundException(
        job.errorMessage || 'Export failed and file is unavailable',
      );
    }

    if (
      job.status === ExportJobStatus.EXPIRED ||
      (job.expiresAt && job.expiresAt.getTime() < Date.now())
    ) {
      throw new GoneException('Export file has expired');
    }

    if (!job.storageKey || !job.fileName) {
      throw new NotFoundException('Export file not found');
    }

    const buffer = await this.s3Service.getObjectBuffer(job.storageKey);
    const contentType =
      job.format === ExportFormat.PDF
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return { buffer, fileName: job.fileName, contentType };
  }

  async processJob(jobId: string) {
    if (this.processing.has(jobId)) return;
    this.processing.add(jobId);

    try {
      const job = await this.jobRepo.findOne({ where: { id: jobId } });
      if (!job) return;
      if (
        job.status !== ExportJobStatus.QUEUED &&
        job.status !== ExportJobStatus.PROCESSING
      ) {
        return;
      }

      const handler = this.handlerRegistry.get(job.entityType);

      job.status = ExportJobStatus.PROCESSING;
      await this.jobRepo.save(job);

      const ids = await handler.resolveRecordIds(
        job.recordIds?.length ? job.recordIds : null,
        job.filters ?? null,
      );
      if (ids.length === 0) {
        throw new Error(handler.emptyMessage);
      }

      const records = await handler.loadRecords(ids, job.mode);
      const file = await handler.generateFile(records, job.format, job.mode);

      const storageKey = `exports/${handler.storageFolder}/${job.id}/${file.fileName}`;
      await this.s3Service.uploadObject(
        storageKey,
        file.buffer,
        file.contentType,
      );

      job.status = ExportJobStatus.COMPLETED;
      job.fileName = file.fileName;
      job.storageKey = storageKey;
      job.recordCount = ids.length;
      job.completedAt = new Date();
      job.errorMessage = null;
      await this.jobRepo.save(job);

      await this.notifyJobFinished(job);
    } catch (err) {
      this.logger.error(
        `Export job ${jobId} failed`,
        err instanceof Error ? err.stack : String(err),
      );
      const errorMessage =
        err instanceof Error
          ? err.message.slice(0, 500)
          : 'Export generation failed';
      await this.jobRepo.update(
        { id: jobId },
        {
          status: ExportJobStatus.FAILED,
          errorMessage,
          completedAt: new Date(),
        },
      );

      const failedJob = await this.jobRepo.findOne({ where: { id: jobId } });
      if (failedJob) {
        await this.notifyJobFinished(failedJob);
      }
    } finally {
      this.processing.delete(jobId);
    }
  }

  private async notifyJobFinished(job: ExportJob) {
    const response = await this.toResponse(job);
    const label = this.entityLabel(job.entityType);
    const completed = job.status === ExportJobStatus.COMPLETED;

    try {
      await this.pusherService.triggerUser(
        job.createdById,
        'export.job.updated',
        response,
      );
    } catch (err) {
      this.logger.warn(
        `Pusher export.job.updated failed for ${job.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    try {
      await this.notificationsService.createNotification({
        type: completed
          ? NotificationType.EXPORT_COMPLETED
          : NotificationType.EXPORT_FAILED,
        module: NotificationModuleCode.EXPORT,
        severity: completed
          ? NotificationSeverity.SUCCESS
          : NotificationSeverity.WARNING,
        title: completed
          ? `${label} export ready`
          : `${label} export failed`,
        message: completed
          ? `Your ${label.toLowerCase()} export (${job.mode}/${job.format}) is ready${
              job.fileName ? `: ${job.fileName}` : ''
            }.`
          : `Your ${label.toLowerCase()} export failed${
              job.errorMessage ? `: ${job.errorMessage}` : '.'
            }`,
        entityType: NotificationEntityType.EXPORT_JOB,
        entityId: job.id,
        actionUrl: completed
          ? `/${this.entityPath(job.entityType)}/export/${job.id}/download`
          : null,
        metadata: {
          jobId: job.id,
          entityType: job.entityType,
          status: job.status,
          format: job.format,
          mode: job.mode,
          fileName: job.fileName ?? null,
          downloadUrl: response.downloadUrl ?? null,
          recordCount: job.recordCount,
          errorMessage: job.errorMessage ?? null,
        },
        groupKey: `export:${job.entityType}:${job.createdById}`,
        eventKey: `export:${job.id}:${job.status}`,
        recipientUserIds: [job.createdById],
      });
    } catch (err) {
      this.logger.warn(
        `Export notification failed for ${job.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private entityLabel(entityType: ExportEntityType): string {
    switch (entityType) {
      case ExportEntityType.DRIVER:
        return 'Driver';
      case ExportEntityType.VEHICLE:
        return 'Vehicle';
      default:
        return 'Export';
    }
  }

  private entityPath(entityType: ExportEntityType): string {
    switch (entityType) {
      case ExportEntityType.DRIVER:
        return 'drivers';
      case ExportEntityType.VEHICLE:
        return 'vehicles';
      default:
        return 'exports';
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredExports() {
    const now = new Date();
    const expired = await this.jobRepo.find({
      where: {
        status: ExportJobStatus.COMPLETED,
        expiresAt: LessThan(now),
      },
      take: 100,
    });

    for (const job of expired) {
      if (job.storageKey) {
        try {
          await this.s3Service.deleteObject(job.storageKey);
        } catch (err) {
          this.logger.warn(
            `Failed to delete export object ${job.storageKey}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      job.status = ExportJobStatus.EXPIRED;
      job.storageKey = null;
      await this.jobRepo.save(job);
    }
  }

  private async assertRateLimit(userId: string) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.jobRepo
      .createQueryBuilder('job')
      .where('job.createdById = :userId', { userId })
      .andWhere('job.createdAt >= :since', { since })
      .getCount();

    if (count >= MAX_JOBS_PER_USER_PER_HOUR) {
      throw new UnprocessableEntityException(
        `Export rate limit exceeded (max ${MAX_JOBS_PER_USER_PER_HOUR} per hour)`,
      );
    }
  }

  private async findAccessibleJob(
    entityType: ExportEntityType,
    user: User,
    jobId: string,
  ): Promise<ExportJob> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, entityType },
    });
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    const isOwner = job.createdById === user.id;
    const isAdmin = user.role?.code === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You cannot access this export job');
    }
    return job;
  }

  private async toResponse(job: ExportJob) {
    let downloadUrl: string | null = null;
    if (
      job.status === ExportJobStatus.COMPLETED &&
      job.storageKey &&
      !(job.expiresAt && job.expiresAt.getTime() < Date.now())
    ) {
      try {
        downloadUrl = await this.s3Service.getPresignedGetObjectUrl(
          job.storageKey,
          DOWNLOAD_URL_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(
          `Could not sign download URL for job ${job.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      id: job.id,
      status: job.status,
      format: job.format,
      mode: job.mode,
      downloadUrl,
      fileName: job.fileName ?? null,
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt?.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }
}
