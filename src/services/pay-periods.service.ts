import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

/** App-local calendar for month boundaries (matches payroll defaults). */
const PAY_PERIOD_TZ = 'Asia/Karachi';

@Injectable()
export class PayPeriodsService implements OnModuleInit {
  private readonly logger = new Logger(PayPeriodsService.name);
  private autoCreateInFlight = false;

  constructor(
    @InjectRepository(PayPeriod)
    private readonly periodRepo: Repository<PayPeriod>,
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /** Ensure the current month period exists as soon as the app boots. */
  async onModuleInit() {
    try {
      await this.ensureCurrentMonthPeriod();
    } catch (err) {
      this.logger.error(
        'Failed to ensure current-month pay period on startup',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Daily (Asia/Karachi midnight): ensure an OPEN pay period exists for the
   * current calendar month (1st → last day). Idempotent via unique (start, end).
   * On the 1st this opens the new month; if the process was down that day,
   * later runs still create the missing period.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: PAY_PERIOD_TZ })
  async handleAutoCreateCurrentMonthPeriod() {
    if (this.autoCreateInFlight) return;
    this.autoCreateInFlight = true;
    try {
      const created = await this.ensureCurrentMonthPeriod();
      if (created) {
        this.logger.log(
          `Auto-created pay period ${created.name} (${created.startDate} → ${created.endDate})`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Pay period auto-create cron failed',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.autoCreateInFlight = false;
    }
  }

  /**
   * Create the pay period for the current calendar month if missing.
   * Returns the new period, or null when it already existed.
   */
  async ensureCurrentMonthPeriod(): Promise<PayPeriod | null> {
    const range = this.currentMonthRange();
    const existing = await this.periodRepo.findOne({
      where: { startDate: range.startDate, endDate: range.endDate },
    });
    if (existing) return null;

    try {
      const saved = await this.periodRepo.save(
        this.periodRepo.create({
          name: range.name,
          startDate: range.startDate,
          endDate: range.endDate,
          status: PayPeriodStatus.OPEN,
        }),
      );

      await this.activitiesService.logAction({
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayPeriod',
        entityId: saved.id,
        record: saved.name,
        description: `Auto-created pay period ${saved.name}`,
        metadata: {
          source: 'pay_period_cron',
          periodKey: range.periodKey,
        },
      });

      return saved;
    } catch (err) {
      // Concurrent cron / unique index race — treat as already created.
      const existingAfterRace = await this.periodRepo.findOne({
        where: { startDate: range.startDate, endDate: range.endDate },
      });
      if (existingAfterRace) return null;
      throw err;
    }
  }

  /** Current calendar month in Asia/Karachi: 1st → last day. */
  private currentMonthRange(): {
    periodKey: string;
    startDate: string;
    endDate: string;
    name: string;
  } {
    const local = this.getZonedYmd(new Date(), PAY_PERIOD_TZ);
    const y = local.year;
    const m = local.month;
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return {
      periodKey: `${y}-${String(m).padStart(2, '0')}`,
      startDate,
      endDate,
      name,
    };
  }

  private getZonedYmd(
    date: Date,
    timeZone: string,
  ): { year: number; month: number; day: number } {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if ([year, month, day].some((n) => Number.isNaN(n))) {
      // Fallback to UTC if timezone lookup fails unexpectedly.
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
    }
    return { year, month, day };
  }

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
