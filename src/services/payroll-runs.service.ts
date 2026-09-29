import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import {
  CalculatePayrollRunDto,
  CreatePayrollRunDto,
  PayrollRunListQueryDto,
  UpdatePayrollRunDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  calculatePayslipAmounts,
  countInclusiveDays,
  emptyAttendanceSummary,
  salarySnapshotFromEntity,
  summarizeAttendance,
  toMoney,
} from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Attendance } from '../database/entities/hr/attendance.entity';
import { Employee } from '../database/entities/hr/employee.entity';
import {
  PayPeriod,
  PayPeriodStatus,
  PayrollRun,
  PayrollRunStatus,
  Payslip,
  PayslipStatus,
} from '../database/entities/hr/payroll.entity';
import {
  PayrollAutomationMode,
  PayrollSettingValue,
} from '../database/entities/system-setting.entity';
import { ActivitiesService } from './activities.service';
import { EmployeeSalariesService } from './employee-salaries.service';
import { SystemSettingService } from './system-setting.service';

@Injectable()
export class PayrollRunsService {
  private readonly logger = new Logger(PayrollRunsService.name);
  private autoRunInFlight = false;

  constructor(
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    @InjectRepository(PayPeriod)
    private readonly periodRepo: Repository<PayPeriod>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly employeeSalariesService: EmployeeSalariesService,
    private readonly activitiesService: ActivitiesService,
    private readonly systemSettingService: SystemSettingService,
  ) {}

  async create(dto: CreatePayrollRunDto, activity?: ActivityActorContext) {
    const period = await this.ensurePeriodOpenForRun(dto.payPeriodId);

    const saved = await this.runRepo.save(
      this.runRepo.create({
        payPeriodId: period.id,
        status: PayrollRunStatus.DRAFT,
        remarks: this.nullableTrim(dto.remarks),
        createdBy: activity?.actor?.id ?? null,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: saved.id,
        record: period.name,
        description: `Created payroll run for ${period.name}`,
      },
      activity,
    );

    if (dto.employeeIds?.length) {
      return this.calculate(
        saved.id,
        { employeeIds: dto.employeeIds },
        activity,
      );
    }

    return this.findOne(saved.id);
  }

  async findAll(query: PayrollRunListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.runRepo
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.payPeriod', 'payPeriod')
      .leftJoinAndSelect('run.createdByUser', 'createdByUser')
      .leftJoinAndSelect('run.approvedByUser', 'approvedByUser')
      .loadRelationCountAndMap('run.payslipCount', 'run.payslips')
      .orderBy('run.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.payPeriodId) {
      qb.andWhere('run.payPeriodId = :payPeriodId', {
        payPeriodId: query.payPeriodId,
      });
    }
    if (query.status) {
      qb.andWhere('run.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(payPeriod.name ILIKE :search OR run.remarks ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) =>
        this.toResponse(
          row,
          (row as PayrollRun & { payslipCount?: number }).payslipCount,
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
    const run = await this.runRepo
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.payPeriod', 'payPeriod')
      .leftJoinAndSelect('run.createdByUser', 'createdByUser')
      .leftJoinAndSelect('run.approvedByUser', 'approvedByUser')
      .loadRelationCountAndMap('run.payslipCount', 'run.payslips')
      .where('run.id = :id', { id })
      .getOne();
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return this.toResponse(
      run,
      (run as PayrollRun & { payslipCount?: number }).payslipCount,
    );
  }

  async update(
    id: string,
    dto: UpdatePayrollRunDto,
    activity?: ActivityActorContext,
  ) {
    const run = await this.findByIdOrFail(id);
    this.assertMutable(run);

    if (dto.remarks !== undefined) {
      run.remarks = this.nullableTrim(dto.remarks);
    }
    await this.runRepo.save(run);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: run.payPeriod?.name ?? id,
        description: `Updated payroll run ${run.payPeriod?.name ?? id}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async calculate(
    id: string,
    dto: CalculatePayrollRunDto = {},
    activity?: ActivityActorContext,
  ) {
    const run = await this.findByIdOrFail(id);
    if (
      run.status !== PayrollRunStatus.DRAFT &&
      run.status !== PayrollRunStatus.CALCULATED
    ) {
      throw new BadRequestException(
        `Cannot calculate payroll run in status ${run.status}`,
      );
    }

    const period = run.payPeriod;
    if (!period) {
      throw new NotFoundException('Pay period not found for payroll run');
    }
    if (period.status === PayPeriodStatus.CLOSED) {
      throw new BadRequestException('Cannot calculate against a closed pay period');
    }

    const employees = await this.resolveEmployees(dto.employeeIds);
    if (employees.length === 0) {
      throw new BadRequestException('No eligible employees found for payroll');
    }

    const employeeIds = employees.map((e) => e.id);
    const salaryMap =
      await this.employeeSalariesService.findActiveMapForEmployees(
        employeeIds,
        period.endDate,
      );
    const attendanceByEmployee = await this.loadAttendanceSummaries(
      employeeIds,
      period.startDate,
      period.endDate,
    );
    const periodDays = countInclusiveDays(period.startDate, period.endDate);

    const existing = await this.payslipRepo.find({
      where: { payrollRunId: id },
    });
    const existingByEmployee = new Map(
      existing.map((p) => [p.employeeId, p] as const),
    );

    let processed = 0;
    let skippedNoSalary = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const employee of employees) {
        const salary = salaryMap.get(employee.id);
        if (!salary) {
          skippedNoSalary += 1;
          continue;
        }

        const snapshot = salarySnapshotFromEntity(salary);
        const attendance =
          attendanceByEmployee.get(employee.id) ?? emptyAttendanceSummary();
        const amounts = calculatePayslipAmounts({
          ...snapshot,
          overtimeMinutes: attendance.overtimeMinutes,
          attendance,
          periodDays,
          otherDeductionAmount: toMoney(
            existingByEmployee.get(employee.id)?.otherDeductionAmount,
          ),
        });

        const current = existingByEmployee.get(employee.id);
        if (current && current.status !== PayslipStatus.DRAFT) {
          continue;
        }

        if (current) {
          Object.assign(current, {
            employeeSalaryId: salary.id,
            ...amounts,
            status: PayslipStatus.DRAFT,
          });
          await manager.save(current);
        } else {
          await manager.save(
            manager.create(Payslip, {
              payrollRunId: id,
              employeeId: employee.id,
              employeeSalaryId: salary.id,
              ...amounts,
              status: PayslipStatus.DRAFT,
            }),
          );
        }
        processed += 1;
      }

      run.status = PayrollRunStatus.CALCULATED;
      run.calculatedAt = new Date();
      await manager.save(run);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.POST,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: period.name,
        description: `Calculated payroll run for ${period.name} (${processed} payslips)`,
        metadata: { processed, skippedNoSalary },
      },
      activity,
    );

    const result = await this.findOne(id);
    return {
      ...result,
      calculation: { processed, skippedNoSalary },
    };
  }

  async approve(id: string, activity?: ActivityActorContext) {
    const run = await this.findByIdOrFail(id);
    if (run.status !== PayrollRunStatus.CALCULATED) {
      throw new BadRequestException(
        'Only CALCULATED payroll runs can be approved',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      run.status = PayrollRunStatus.APPROVED;
      run.approvedAt = new Date();
      run.approvedBy = activity?.actor?.id ?? null;
      await manager.save(run);

      await manager
        .createQueryBuilder()
        .update(Payslip)
        .set({ status: PayslipStatus.FINALIZED })
        .where('payrollRunId = :id', { id })
        .andWhere('status = :draft', { draft: PayslipStatus.DRAFT })
        .execute();
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.APPROVE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: run.payPeriod?.name ?? id,
        description: `Approved payroll run ${run.payPeriod?.name ?? id}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async markPaid(id: string, activity?: ActivityActorContext) {
    const run = await this.findByIdOrFail(id);
    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new BadRequestException(
        'Only APPROVED payroll runs can be marked as paid',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      run.status = PayrollRunStatus.PAID;
      await manager.save(run);

      await manager
        .createQueryBuilder()
        .update(Payslip)
        .set({ status: PayslipStatus.PAID })
        .where('payrollRunId = :id', { id })
        .andWhere('status IN (:...statuses)', {
          statuses: [PayslipStatus.FINALIZED, PayslipStatus.DRAFT],
        })
        .execute();
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.SETTLE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: run.payPeriod?.name ?? id,
        description: `Marked payroll run paid ${run.payPeriod?.name ?? id}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async cancel(id: string, activity?: ActivityActorContext) {
    const run = await this.findByIdOrFail(id);
    if (
      run.status === PayrollRunStatus.PAID ||
      run.status === PayrollRunStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel payroll run in status ${run.status}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      run.status = PayrollRunStatus.CANCELLED;
      await manager.save(run);

      await manager
        .createQueryBuilder()
        .update(Payslip)
        .set({ status: PayslipStatus.CANCELLED })
        .where('payrollRunId = :id', { id })
        .andWhere('status != :paid', { paid: PayslipStatus.PAID })
        .execute();
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: run.payPeriod?.name ?? id,
        description: `Cancelled payroll run ${run.payPeriod?.name ?? id}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const run = await this.findByIdOrFail(id);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT payroll runs can be deleted');
    }

    await this.runRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayrollRun',
        entityId: id,
        record: run.payPeriod?.name ?? id,
        description: `Deleted payroll run ${run.payPeriod?.name ?? id}`,
      },
      activity,
    );

    return { id, deleted: true };
  }

  async listUtility(opts: {
    search?: string;
    payPeriodId?: string;
    status?: PayrollRunStatus;
  } = {}) {
    const qb = this.runRepo
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.payPeriod', 'payPeriod')
      .orderBy('run.createdAt', 'DESC');

    if (opts.payPeriodId) {
      qb.andWhere('run.payPeriodId = :payPeriodId', {
        payPeriodId: opts.payPeriodId,
      });
    }
    if (opts.status) {
      qb.andWhere('run.status = :status', { status: opts.status });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('payPeriod.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((r) => ({
        id: r.id,
        label: `${r.payPeriod?.name ?? r.payPeriodId} — ${r.status}`,
        payPeriodId: r.payPeriodId,
        payPeriodName: r.payPeriod?.name ?? null,
        status: r.status,
        calculatedAt: r.calculatedAt,
        approvedAt: r.approvedAt,
      })),
    };
  }

  private async resolveEmployees(employeeIds?: string[]) {
    const qb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.attendanceEnabled = true');

    if (employeeIds?.length) {
      qb.andWhere('employee.id IN (:...employeeIds)', { employeeIds });
    }

    return qb.getMany();
  }

  private async loadAttendanceSummaries(
    employeeIds: string[],
    startDate: string,
    endDate: string,
  ) {
    const map = new Map(
      employeeIds.map((id) => [id, emptyAttendanceSummary()] as const),
    );
    if (employeeIds.length === 0) return map;

    try {
      const rows = await this.dataSource.getRepository(Attendance).find({
        where: { employeeId: In(employeeIds) },
      });

      const grouped = new Map<string, Attendance[]>();
      for (const row of rows) {
        if (row.attendanceDate < startDate || row.attendanceDate > endDate) {
          continue;
        }
        const list = grouped.get(row.employeeId) ?? [];
        list.push(row);
        grouped.set(row.employeeId, list);
      }

      for (const [employeeId, days] of grouped) {
        map.set(
          employeeId,
          summarizeAttendance(
            days.map((d) => ({
              status: d.status,
              workedMinutes: d.workedMinutes,
              lateMinutes: d.lateMinutes,
              shortfallMinutes: d.shortfallMinutes,
              overtimeMinutes: d.overtimeMinutes,
            })),
          ),
        );
      }
    } catch {
      // Attendance table may be unavailable; salary-only calculation still works.
    }

    return map;
  }

  private async ensurePeriodOpenForRun(payPeriodId: string) {
    const period = await this.periodRepo.findOne({ where: { id: payPeriodId } });
    if (!period) {
      throw new NotFoundException('Pay period not found');
    }
    if (period.status === PayPeriodStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot create payroll run for a closed pay period',
      );
    }
    return period;
  }

  private assertMutable(run: PayrollRun) {
    if (
      run.status !== PayrollRunStatus.DRAFT &&
      run.status !== PayrollRunStatus.CALCULATED
    ) {
      throw new BadRequestException(
        `Payroll run in status ${run.status} cannot be modified`,
      );
    }
  }

  private async findByIdOrFail(id: string) {
    const run = await this.runRepo.findOne({
      where: { id },
      relations: {
        payPeriod: true,
        createdByUser: true,
        approvedByUser: true,
      },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private toResponse(run: PayrollRun, payslipCount?: number) {
    return {
      id: run.id,
      payPeriodId: run.payPeriodId,
      status: run.status,
      calculatedAt: run.calculatedAt,
      approvedAt: run.approvedAt,
      approvedBy: run.approvedBy,
      createdBy: run.createdBy,
      remarks: run.remarks,
      payslipCount: payslipCount ?? 0,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      payPeriod: run.payPeriod
        ? {
            id: run.payPeriod.id,
            name: run.payPeriod.name,
            startDate: run.payPeriod.startDate,
            endDate: run.payPeriod.endDate,
            status: run.payPeriod.status,
          }
        : null,
      createdByUser: run.createdByUser
        ? { id: run.createdByUser.id, name: run.createdByUser.name }
        : null,
      approvedByUser: run.approvedByUser
        ? { id: run.approvedByUser.id, name: run.approvedByUser.name }
        : null,
    };
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }

  /**
   * Every minute: if payroll setting is AUTO and local day/time has passed,
   * generate previous-month period + calculated run (idempotent).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPayrollAutomation() {
    if (this.autoRunInFlight) return;

    let settings: PayrollSettingValue;
    try {
      const { value } = await this.systemSettingService.getPayrollSetting();
      settings = value;
    } catch (err) {
      this.logger.error(
        'Failed to load payroll settings for cron',
        err instanceof Error ? err.stack : String(err),
      );
      return;
    }

    if (settings.mode !== PayrollAutomationMode.AUTO) return;
    if (!settings.autoCreatePeriod && !settings.autoCalculate) return;

    const local = this.getZonedParts(new Date(), settings.timezone);
    if (!local) return;

    if (local.day !== settings.autoDayOfMonth) return;
    if (!this.hasReachedLocalTime(local, settings.autoTime)) return;

    const target = this.previousMonthRange(local.year, local.month);
    if (settings.lastAutoPeriodKey === target.periodKey) return;

    this.autoRunInFlight = true;
    try {
      const result = await this.runAutomatedPayroll(settings, target);
      this.logger.log(
        `Payroll auto cron done — periodKey=${target.periodKey} status=${result.status} runId=${result.runId ?? 'n/a'}`,
      );
    } catch (err) {
      this.logger.error(
        `Payroll auto cron failed for ${target.periodKey}`,
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.autoRunInFlight = false;
    }
  }

  /**
   * Create previous-month pay period (optional) + payroll run + calculate.
   * Marks `lastAutoPeriodKey` after a successful pass so the day can catch up
   * if the process was down at the exact scheduled minute.
   */
  async runAutomatedPayroll(
    settings: PayrollSettingValue,
    target: { periodKey: string; startDate: string; endDate: string; name: string },
  ): Promise<{
    status: 'created' | 'skipped_existing' | 'period_only';
    periodId: string;
    runId: string | null;
  }> {
    let period = await this.periodRepo.findOne({
      where: { startDate: target.startDate, endDate: target.endDate },
    });

    if (!period) {
      if (!settings.autoCreatePeriod) {
        this.logger.warn(
          `Payroll auto: no pay period for ${target.periodKey} and autoCreatePeriod=false`,
        );
        return { status: 'period_only', periodId: '', runId: null };
      }
      period = await this.periodRepo.save(
        this.periodRepo.create({
          name: target.name,
          startDate: target.startDate,
          endDate: target.endDate,
          status: PayPeriodStatus.OPEN,
        }),
      );
      await this.activitiesService.logAction({
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'PayPeriod',
        entityId: period.id,
        record: period.name,
        description: `Auto-created pay period ${period.name}`,
        metadata: { source: 'payroll_cron', periodKey: target.periodKey },
      });
    }

    if (!settings.autoCalculate) {
      await this.systemSettingService.markPayrollAutoPeriodDone(
        target.periodKey,
      );
      return { status: 'period_only', periodId: period.id, runId: null };
    }

    const existingRun = await this.runRepo.findOne({
      where: {
        payPeriodId: period.id,
        status: Not(PayrollRunStatus.CANCELLED),
      },
      order: { createdAt: 'DESC' },
    });

    if (existingRun) {
      await this.systemSettingService.markPayrollAutoPeriodDone(
        target.periodKey,
      );
      return {
        status: 'skipped_existing',
        periodId: period.id,
        runId: existingRun.id,
      };
    }

    const created = await this.create(
      {
        payPeriodId: period.id,
        remarks: `Auto payroll for ${target.name}`,
      },
      undefined,
    );

    const runId = created.id as string;
    const calculated = await this.calculate(runId, {}, undefined);

    if (settings.autoApprove) {
      await this.approve(runId, undefined);
      if (settings.autoMarkPaid) {
        await this.markPaid(runId, undefined);
      }
    }

    await this.systemSettingService.markPayrollAutoPeriodDone(target.periodKey);

    return {
      status: 'created',
      periodId: period.id,
      runId: (calculated.id as string) ?? runId,
    };
  }

  private getZonedParts(
    date: Date,
    timeZone: string,
  ): { year: number; month: number; day: number; hour: number; minute: number } | null {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(date);
      const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? NaN);
      const year = get('year');
      const month = get('month');
      const day = get('day');
      const hour = get('hour');
      const minute = get('minute');
      if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) {
        return null;
      }
      return { year, month, day, hour, minute };
    } catch {
      this.logger.warn(`Invalid payroll timezone: ${timeZone}`);
      return null;
    }
  }

  private hasReachedLocalTime(
    local: { hour: number; minute: number },
    autoTime: string,
  ): boolean {
    const [hStr, mStr] = autoTime.split(':');
    const targetHour = Number(hStr);
    const targetMinute = Number(mStr);
    if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) return false;
    const nowMinutes = local.hour * 60 + local.minute;
    const targetMinutes = targetHour * 60 + targetMinute;
    return nowMinutes >= targetMinutes;
  }

  /** Previous calendar month relative to (year, month) in local zone. */
  private previousMonthRange(
    year: number,
    month: number,
  ): { periodKey: string; startDate: string; endDate: string; name: string } {
    let y = year;
    let m = month - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return {
      periodKey: `${y}-${String(m).padStart(2, '0')}`,
      startDate,
      endDate,
      name: monthLabel,
    };
  }
}
