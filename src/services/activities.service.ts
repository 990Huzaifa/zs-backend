import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityListQueryDto } from '../auth/dto/activity.dto';
import {
  Activity,
  ActivityAction,
  ActivityActorType,
  ActivityModule,
  ActivityUserType,
} from '../database/entities/activity.entity';

export type CreateActivityInput = {
  actorType: ActivityActorType;
  action: ActivityAction;
  adminId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  userType?: ActivityUserType | null;
  module?: ActivityModule | null;
  record?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
  ) {}

  /** Persist an activity row — call from other services when events occur. */
  async log(input: CreateActivityInput): Promise<Activity> {
    const activity = this.activityRepo.create({
      actorType: input.actorType,
      action: input.action,
      adminId: input.adminId ?? null,
      userId: input.userId ?? null,
      actorName: input.actorName ?? null,
      userType: input.userType ?? null,
      module: input.module ?? null,
      record: input.record ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    return this.activityRepo.save(activity);
  }

  async findAll(query: ActivityListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.activityRepo
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.user', 'user')
      .orderBy('activity.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.module) {
      qb.andWhere('activity.module = :module', { module: query.module });
    }
    if (query.action) {
      qb.andWhere('activity.action = :action', { action: query.action });
    }
    if (query.userType) {
      qb.andWhere('activity.userType = :userType', {
        userType: query.userType,
      });
    }
    if (query.userId) {
      qb.andWhere('activity.userId = :userId', { userId: query.userId });
    }

    const { start, end } = this.resolveDateRange(query);
    if (start) {
      qb.andWhere('activity.createdAt >= :start', { start });
    }
    if (end) {
      qb.andWhere('activity.createdAt < :end', { end });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          activity.actorName ILIKE :search
          OR activity.description ILIKE :search
          OR activity.record ILIKE :search
          OR user.name ILIKE :search
          OR CAST(activity.action AS text) ILIKE :search
          OR CAST(activity.module AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const activity = await this.activityRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!activity) {
      throw new NotFoundException('Activity log not found');
    }
    return this.toDetail(activity);
  }

  private resolveDateRange(query: ActivityListQueryDto): {
    start?: Date;
    end?: Date;
  } {
    if (query.startDate || query.endDate) {
      const start = query.startDate
        ? this.startOfDay(query.startDate)
        : undefined;
      const end = query.endDate
        ? this.startOfNextDay(query.endDate)
        : undefined;
      return { start, end };
    }
    if (query.date) {
      return {
        start: this.startOfDay(query.date),
        end: this.startOfNextDay(query.date),
      };
    }
    return {};
  }

  private startOfDay(isoDate: string): Date {
    const d = new Date(isoDate);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private startOfNextDay(isoDate: string): Date {
    const d = this.startOfDay(isoDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  private toListItem(activity: Activity) {
    return {
      id: activity.id,
      timestamp: activity.createdAt,
      user: activity.actorName ?? activity.user?.name ?? null,
      userId: activity.userId ?? null,
      type: activity.userType ?? null,
      action: activity.action,
      module: activity.module ?? null,
      details: activity.description ?? null,
      record: activity.record ?? null,
      ip: activity.ip ?? null,
    };
  }

  private toDetail(activity: Activity) {
    return {
      ...this.toListItem(activity),
      actorType: activity.actorType,
      adminId: activity.adminId ?? null,
      entityType: activity.entityType ?? null,
      entityId: activity.entityId ?? null,
      metadata: activity.metadata ?? null,
      userAgent: activity.userAgent ?? null,
      user: activity.user
        ? {
            id: activity.user.id,
            name: activity.user.name,
            email: activity.user.email,
            code: activity.user.code,
            profileType: activity.user.profileType,
          }
        : null,
    };
  }
}
