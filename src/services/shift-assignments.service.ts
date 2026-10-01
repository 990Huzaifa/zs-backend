import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  BulkCreateShiftAssignmentsDto,
  CreateShiftAssignmentDto,
  ShiftAssignmentListQueryDto,
  UpdateShiftAssignmentDto,
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
import { Employee } from '../database/entities/hr/employee.entity';
import {
  BreakPolicy,
  Shift,
  ShiftAssignment,
} from '../database/entities/hr/shift.entity';
import { ActivitiesService } from './activities.service';

const MAX_BULK_DAYS = 93;

@Injectable()
export class ShiftAssignmentsService {
  constructor(
    @InjectRepository(ShiftAssignment)
    private readonly assignmentRepo: Repository<ShiftAssignment>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateShiftAssignmentDto, activity?: ActivityActorContext) {
    const workDate = this.normalizeDate(dto.workDate);
    await this.ensureEmployee(dto.employeeId);
    const shift = await this.loadActiveShiftWithPolicy(dto.shiftId);
    await this.ensureNoDuplicate(dto.employeeId, workDate);

    const { scheduledStartAt, scheduledEndAt } = this.buildSchedule(
      workDate,
      shift.startTime,
      shift.endTime,
    );

    const saved = await this.assignmentRepo.save(
      this.assignmentRepo.create({
        employeeId: dto.employeeId,
        shiftId: shift.id,
        workDate,
        scheduledStartAt,
        scheduledEndAt,
        policySnapshot: this.buildPolicySnapshot(shift),
      }),
    );

    const result = await this.findOne(saved.id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'ShiftAssignment',
        entityId: saved.id,
        record: `${result.employee?.name ?? dto.employeeId} @ ${workDate}`,
        description: `Assigned shift ${shift.name} to employee on ${workDate}`,
      },
      activity,
    );

    return result;
  }

  async bulkCreate(
    dto: BulkCreateShiftAssignmentsDto,
    activity?: ActivityActorContext,
  ) {
    const fromDate = this.normalizeDate(dto.fromDate);
    const toDate = this.normalizeDate(dto.toDate);
    if (toDate < fromDate) {
      throw new BadRequestException('toDate must be on or after fromDate');
    }

    const dayCount = countInclusiveDays(fromDate, toDate);
    if (dayCount === 0 || dayCount > MAX_BULK_DAYS) {
      throw new BadRequestException(
        `Date range must be between 1 and ${MAX_BULK_DAYS} days`,
      );
    }

    const employeeIds = [...new Set(dto.employeeIds)];
    await this.ensureEmployeesExist(employeeIds);
    const shift = await this.loadActiveShiftWithPolicy(dto.shiftId);
    const workDates = this.enumerateDates(fromDate, toDate);
    const skipExisting = dto.skipExisting ?? false;

    const existing = await this.assignmentRepo.find({
      where: {
        employeeId: In(employeeIds),
        workDate: In(workDates),
      },
      select: ['id', 'employeeId', 'workDate'],
    });
    const existingKeys = new Set(
      existing.map((row) => `${row.employeeId}|${row.workDate}`),
    );

    const toCreate: Array<{
      employeeId: string;
      shiftId: string;
      workDate: string;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
      policySnapshot: Record<string, unknown>;
    }> = [];
    let skipped = 0;

    for (const employeeId of employeeIds) {
      for (const workDate of workDates) {
        const key = `${employeeId}|${workDate}`;
        if (existingKeys.has(key)) {
          if (!skipExisting) {
            throw new ConflictException(
              `Shift already assigned for employee ${employeeId} on ${workDate}`,
            );
          }
          skipped += 1;
          continue;
        }

        const { scheduledStartAt, scheduledEndAt } = this.buildSchedule(
          workDate,
          shift.startTime,
          shift.endTime,
        );
        toCreate.push({
          employeeId,
          shiftId: shift.id,
          workDate,
          scheduledStartAt,
          scheduledEndAt,
          policySnapshot: this.buildPolicySnapshot(shift),
        });
      }
    }

    let created = 0;
    if (toCreate.length > 0) {
      const inserted = await this.assignmentRepo.save(
        toCreate.map((row) => this.assignmentRepo.create(row)),
      );
      created = inserted.length;
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'ShiftAssignment',
        entityId: shift.id,
        record: shift.name,
        description: `Bulk assigned shift ${shift.name}: created=${created}, skipped=${skipped}`,
      },
      activity,
    );

    return {
      shiftId: shift.id,
      fromDate,
      toDate,
      employeeCount: employeeIds.length,
      dayCount,
      created,
      skipped,
    };
  }

  async findAll(query: ShiftAssignmentListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('a.shift', 'shift')
      .leftJoinAndSelect('shift.breakPolicy', 'breakPolicy')
      .orderBy('a.workDate', 'DESC')
      .addOrderBy('user.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (query.employeeId) {
      qb.andWhere('a.employeeId = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.shiftId) {
      qb.andWhere('a.shiftId = :shiftId', { shiftId: query.shiftId });
    }
    if (query.fromDate) {
      qb.andWhere('a.workDate >= :fromDate', {
        fromDate: this.normalizeDate(query.fromDate),
      });
    }
    if (query.toDate) {
      qb.andWhere('a.workDate <= :toDate', {
        toDate: this.normalizeDate(query.toDate),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR shift.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const assignment = await this.assignmentRepo.findOne({
      where: { id },
      relations: {
        employee: { user: true },
        shift: { breakPolicy: true },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Shift assignment not found');
    }
    return this.toResponse(assignment);
  }

  async update(
    id: string,
    dto: UpdateShiftAssignmentDto,
    activity?: ActivityActorContext,
  ) {
    if (dto.shiftId === undefined && dto.workDate === undefined) {
      throw new BadRequestException('No fields to update');
    }

    const assignment = await this.assignmentRepo.findOne({ where: { id } });
    if (!assignment) {
      throw new NotFoundException('Shift assignment not found');
    }

    const nextWorkDate = dto.workDate
      ? this.normalizeDate(dto.workDate)
      : assignment.workDate;
    const nextShiftId = dto.shiftId ?? assignment.shiftId;

    if (
      nextWorkDate !== assignment.workDate ||
      nextShiftId !== assignment.shiftId
    ) {
      if (nextWorkDate !== assignment.workDate) {
        await this.ensureNoDuplicate(
          assignment.employeeId,
          nextWorkDate,
          assignment.id,
        );
      }

      const shift = await this.loadActiveShiftWithPolicy(nextShiftId);
      const { scheduledStartAt, scheduledEndAt } = this.buildSchedule(
        nextWorkDate,
        shift.startTime,
        shift.endTime,
      );

      assignment.shiftId = shift.id;
      assignment.workDate = nextWorkDate;
      assignment.scheduledStartAt = scheduledStartAt;
      assignment.scheduledEndAt = scheduledEndAt;
      assignment.policySnapshot = this.buildPolicySnapshot(shift);
    }

    await this.assignmentRepo.save(assignment);

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'ShiftAssignment',
        entityId: id,
        record: `${result.employee?.name ?? assignment.employeeId} @ ${assignment.workDate}`,
        description: `Updated shift assignment on ${assignment.workDate}`,
      },
      activity,
    );

    return result;
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const assignment = await this.assignmentRepo.findOne({
      where: { id },
      relations: {
        employee: { user: true },
        shift: true,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Shift assignment not found');
    }

    const attendanceCount = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM attendances WHERE "shiftAssignmentId" = $1`,
      [id],
    );
    if ((attendanceCount?.[0]?.count ?? 0) > 0) {
      throw new ConflictException(
        'Cannot delete shift assignment linked to attendance',
      );
    }

    await this.assignmentRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'ShiftAssignment',
        entityId: id,
        record: `${assignment.employee?.user?.name ?? assignment.employeeId} @ ${assignment.workDate}`,
        description: `Removed shift assignment on ${assignment.workDate}`,
      },
      activity,
    );

    return { message: 'Shift assignment deleted' };
  }

  private async ensureEmployee(employeeId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new BadRequestException('Employee not found');
    }
    return employee;
  }

  private async ensureEmployeesExist(employeeIds: string[]) {
    const rows = await this.employeeRepo.find({
      where: { id: In(employeeIds) },
      select: ['id'],
    });
    if (rows.length !== employeeIds.length) {
      throw new BadRequestException('One or more employees not found');
    }
  }

  private async loadActiveShiftWithPolicy(shiftId: string) {
    const shift = await this.shiftRepo.findOne({
      where: { id: shiftId },
      relations: { breakPolicy: true },
    });
    if (!shift) {
      throw new BadRequestException('Shift not found');
    }
    if (!shift.isActive) {
      throw new BadRequestException('Shift is inactive');
    }
    if (!shift.breakPolicy) {
      throw new BadRequestException('Shift break policy not found');
    }
    return shift;
  }

  private async ensureNoDuplicate(
    employeeId: string,
    workDate: string,
    excludeId?: string,
  ) {
    const existing = await this.assignmentRepo.findOne({
      where: { employeeId, workDate },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Employee already has a shift assigned on this date',
      );
    }
  }

  private normalizeDate(value: string) {
    const date = value.slice(0, 10);
    if (!parseIsoDate(date)) {
      throw new BadRequestException('Invalid date; expected YYYY-MM-DD');
    }
    return date;
  }

  private enumerateDates(fromDate: string, toDate: string): string[] {
    const dates: string[] = [];
    let cursor = parseIsoDate(fromDate);
    const end = parseIsoDate(toDate);
    if (!cursor || !end) {
      throw new BadRequestException('Invalid date range');
    }
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    return dates;
  }

  private normalizeTime(value: string) {
    const parts = value.trim().split(':');
    if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
    return value.trim().slice(0, 8);
  }

  private buildSchedule(workDate: string, startTime: string, endTime: string) {
    const start = this.normalizeTime(startTime);
    const end = this.normalizeTime(endTime);
    const scheduledStartAt = new Date(`${workDate}T${start}.000Z`);
    let scheduledEndAt = new Date(`${workDate}T${end}.000Z`);
    if (Number.isNaN(scheduledStartAt.getTime()) || Number.isNaN(scheduledEndAt.getTime())) {
      throw new BadRequestException('Invalid shift schedule times');
    }
    // Overnight shift: end is next calendar day.
    if (scheduledEndAt <= scheduledStartAt) {
      scheduledEndAt = new Date(scheduledEndAt.getTime() + 86_400_000);
    }
    return { scheduledStartAt, scheduledEndAt };
  }

  private buildPolicySnapshot(shift: Shift & { breakPolicy: BreakPolicy }) {
    return {
      shift: {
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        requiredWorkMinutes: shift.requiredWorkMinutes,
        graceMinutes: shift.graceMinutes,
      },
      breakPolicy: {
        id: shift.breakPolicy.id,
        name: shift.breakPolicy.name,
        allowedMinutes: shift.breakPolicy.allowedMinutes,
        windowStart: shift.breakPolicy.windowStart,
        windowEnd: shift.breakPolicy.windowEnd,
        allowMultipleBreaks: shift.breakPolicy.allowMultipleBreaks,
        paid: shift.breakPolicy.paid,
        excessDeductible: shift.breakPolicy.excessDeductible,
      },
    };
  }

  private toResponse(assignment: ShiftAssignment) {
    const employee = assignment.employee;
    const user = employee?.user;
    return {
      id: assignment.id,
      employeeId: assignment.employeeId,
      shiftId: assignment.shiftId,
      workDate: assignment.workDate,
      scheduledStartAt: assignment.scheduledStartAt,
      scheduledEndAt: assignment.scheduledEndAt,
      policySnapshot: assignment.policySnapshot,
      employee: employee
        ? {
            id: employee.id,
            name: user?.name ?? null,
            userCode: user?.code ?? null,
            designation: employee.designation ?? null,
          }
        : null,
      shift: assignment.shift
        ? {
            id: assignment.shift.id,
            name: assignment.shift.name,
            startTime: assignment.shift.startTime,
            endTime: assignment.shift.endTime,
            requiredWorkMinutes: assignment.shift.requiredWorkMinutes,
            graceMinutes: assignment.shift.graceMinutes,
            breakPolicyId: assignment.shift.breakPolicyId,
            breakPolicy: assignment.shift.breakPolicy
              ? {
                  id: assignment.shift.breakPolicy.id,
                  name: assignment.shift.breakPolicy.name,
                  allowedMinutes: assignment.shift.breakPolicy.allowedMinutes,
                }
              : null,
          }
        : null,
    };
  }
}
