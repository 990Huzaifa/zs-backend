import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreatePayPeriodDto,
  PayPeriodListQueryDto,
  UpdatePayPeriodDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  countInclusiveDays,
  parseIsoDate,
} from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  PayPeriod,
  PayPeriodStatus,
  PayrollRun,
} from '../database/entities/hr/payroll.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class PayPeriodsService {
  constructor(
    @InjectRepository(PayPeriod)
    private readonly periodRepo: Repository<PayPeriod>,
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreatePayPeriodDto, activity?: ActivityActorContext) {
    const startDate = dto.startDate.slice(0, 10);
    const endDate = dto.endDate.slice(0, 10);
    this.assertDateRange(startDate, endDate);
    await this.ensureUniqueRange(startDate, endDate);

    const saved = await this.periodRepo.save(
      this.periodRepo.create({
        name: dto.name.trim(),
        startDate,
        endDate,
        status: dto.status ?? PayPeriodStatus.OPEN,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayPeriod',
        entityId: saved.id,
        record: saved.name,
        description: `Created pay period ${saved.name}`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: PayPeriodListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.periodRepo
      .createQueryBuilder('period')
      .loadRelationCountAndMap('period.runCount', 'period.payrollRuns')
      .orderBy('period.startDate', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('period.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('period.name ILIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) =>
        this.toResponse(
          row,
          (row as PayPeriod & { runCount?: number }).runCount,
        ),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const period = await this.periodRepo
      .createQueryBuilder('period')
      .loadRelationCountAndMap('period.runCount', 'period.payrollRuns')
      .where('period.id = :id', { id })
      .getOne();
    if (!period) {
      throw new NotFoundException('Pay period not found');
    }
    return this.toResponse(
      period,
      (period as PayPeriod & { runCount?: number }).runCount,
    );
  }

  async update(
    id: string,
    dto: UpdatePayPeriodDto,
    activity?: ActivityActorContext,
  ) {
    const period = await this.findByIdOrFail(id);

    if (period.status === PayPeriodStatus.CLOSED) {
      throw new BadRequestException('Closed pay periods cannot be edited');
    }

    const startDate =
      dto.startDate !== undefined
        ? dto.startDate.slice(0, 10)
        : period.startDate;
    const endDate =
      dto.endDate !== undefined ? dto.endDate.slice(0, 10) : period.endDate;
    this.assertDateRange(startDate, endDate);

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      await this.ensureUniqueRange(startDate, endDate, id);
      const runCount = await this.runRepo.count({
        where: { payPeriodId: id },
      });
      if (runCount > 0) {
        throw new ConflictException(
          'Cannot change dates of a pay period that already has payroll runs',
        );
      }
    }

    if (dto.name !== undefined) period.name = dto.name.trim();
    period.startDate = startDate;
    period.endDate = endDate;

    if (dto.status !== undefined) {
      this.assertStatusTransition(period.status, dto.status);
      period.status = dto.status;
    }

    await this.periodRepo.save(period);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayPeriod',
        entityId: period.id,
        record: period.name,
        description: `Updated pay period ${period.name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async lock(id: string, activity?: ActivityActorContext) {
    return this.update(
      id,
      { status: PayPeriodStatus.LOCKED },
      activity,
    );
  }

  async close(id: string, activity?: ActivityActorContext) {
    return this.update(
      id,
      { status: PayPeriodStatus.CLOSED },
      activity,
    );
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const period = await this.findByIdOrFail(id);
    const runCount = await this.runRepo.count({ where: { payPeriodId: id } });
    if (runCount > 0) {
      throw new ConflictException(
        'Cannot delete pay period with existing payroll runs',
      );
    }

    await this.periodRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayPeriod',
        entityId: id,
        record: period.name,
        description: `Deleted pay period ${period.name}`,
      },
      activity,
    );

    return { message: 'Pay period deleted' };
  }

  async listUtility(opts: {
    search?: string;
    status?: PayPeriodStatus;
  } = {}) {
    const qb = this.periodRepo
      .createQueryBuilder('period')
      .orderBy('period.startDate', 'DESC');

    if (opts.status) {
      qb.andWhere('period.status = :status', { status: opts.status });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('period.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((p) => ({
        id: p.id,
        label: `${p.name} (${p.startDate} → ${p.endDate})`,
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        days: countInclusiveDays(p.startDate, p.endDate),
      })),
    };
  }

  private assertDateRange(startDate: string, endDate: string) {
    if (!parseIsoDate(startDate) || !parseIsoDate(endDate)) {
      throw new BadRequestException('Invalid pay period dates');
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
  }

  private assertStatusTransition(
    current: PayPeriodStatus,
    next: PayPeriodStatus,
  ) {
    if (current === next) return;
    const allowed: Record<PayPeriodStatus, PayPeriodStatus[]> = {
      [PayPeriodStatus.OPEN]: [
        PayPeriodStatus.LOCKED,
        PayPeriodStatus.CLOSED,
      ],
      [PayPeriodStatus.LOCKED]: [PayPeriodStatus.CLOSED],
      [PayPeriodStatus.CLOSED]: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Cannot transition pay period from ${current} to ${next}`,
      );
    }
  }

  private async ensureUniqueRange(
    startDate: string,
    endDate: string,
    excludeId?: string,
  ) {
    const qb = this.periodRepo
      .createQueryBuilder('period')
      .where('period.startDate = :startDate', { startDate })
      .andWhere('period.endDate = :endDate', { endDate });
    if (excludeId) {
      qb.andWhere('period.id != :excludeId', { excludeId });
    }
    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'A pay period with the same start and end dates already exists',
      );
    }
  }

  private async findByIdOrFail(id: string) {
    const period = await this.periodRepo.findOne({ where: { id } });
    if (!period) {
      throw new NotFoundException('Pay period not found');
    }
    return period;
  }

  private toResponse(period: PayPeriod, runCount?: number) {
    return {
      id: period.id,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      days: countInclusiveDays(period.startDate, period.endDate),
      runCount: runCount ?? 0,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    };
  }
}
