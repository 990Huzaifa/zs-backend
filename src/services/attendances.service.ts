import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AdjustAttendanceDto,
  ManualAttendanceDto,
  PunchAttendanceDto,
} from '../auth/dto/attendance.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  NotificationEntityType,
  NotificationModuleCode,
  NotificationType,
} from '../common/notifications/notification.constants';
import {
  calculateAttendanceMetrics,
  combineDateAndTime,
  buildDayScheduleFromShift,
  minutesBetween,
  readPolicySnapshot,
} from '../common/utils/attendance.util';
import { parseIsoDate } from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  AdjustmentStatus,
  Attendance,
  AttendanceAdjustment,
  AttendanceEvent,
  AttendanceEventType,
  AttendanceSession,
  AttendanceSource,
  AttendanceStatus,
  CalculationStatus,
  CheckOutReason,
  SessionType,
} from '../database/entities/hr/attendance.entity';
import { Employee } from '../database/entities/hr/employee.entity';
import {
  BreakPolicy,
  Shift,
} from '../database/entities/hr/shift.entity';
import { NotificationSeverity } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    @InjectRepository(AttendanceSession)
    private readonly sessionRepo: Repository<AttendanceSession>,
    @InjectRepository(AttendanceAdjustment)
    private readonly adjustmentRepo: Repository<AttendanceAdjustment>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async manualEntry(dto: ManualAttendanceDto, actor: User, activity?: ActivityActorContext) {
    const attendanceDate = this.normalizeDate(dto.attendanceDate);
    const employee = await this.ensureEmployee(dto.employeeId);
    const shiftId = dto.shiftId ?? employee.shiftId;
    if (!shiftId) {
      throw new BadRequestException(
        'Employee has no shift assigned; set employee.shiftId or pass shiftId',
      );
    }
    const shift = await this.loadActiveShift(shiftId);
    const day = buildDayScheduleFromShift(attendanceDate, shift);

    const checkInAt = this.resolveDateTime(attendanceDate, dto.checkInAt);
    const checkOutAt = this.resolveDateTime(attendanceDate, dto.checkOutAt, true, checkInAt);
    const breakOutAt = dto.breakOutAt
      ? this.resolveDateTime(attendanceDate, dto.breakOutAt)
      : null;
    const breakInAt = dto.breakInAt
      ? this.resolveDateTime(attendanceDate, dto.breakInAt, true, breakOutAt ?? checkInAt)
      : null;

    if (breakOutAt && breakInAt && breakInAt <= breakOutAt) {
      throw new BadRequestException('breakInAt must be after breakOutAt');
    }
    if (checkOutAt <= checkInAt) {
      throw new BadRequestException('checkOutAt must be after checkInAt');
    }

    const existing = await this.attendanceRepo.findOne({
      where: { employeeId: employee.id, attendanceDate },
    });
    if (existing) {
      throw new ConflictException(
        'Attendance already exists for this employee on this date; use adjust instead',
      );
    }

    const source = dto.source ?? AttendanceSource.ADMIN;
    const saved = await this.dataSource.transaction(async (manager) => {
      const attendance = await manager.getRepository(Attendance).save(
        manager.getRepository(Attendance).create({
          employeeId: employee.id,
          attendanceDate,
          scheduledStartAt: day.scheduledStartAt,
          scheduledEndAt: day.scheduledEndAt,
          policySnapshot: day.policySnapshot as Record<string, unknown>,
          firstCheckIn: checkInAt,
          lastCheckOut: checkOutAt,
          breakOutAt,
          breakInAt,
          source,
          workLocation: dto.workLocation?.trim() || null,
          notes: dto.remarks?.trim() || null,
          leaveType: null,
          status: AttendanceStatus.PRESENT,
          calculationStatus: CalculationStatus.OPEN,
          calculationVersion: 1,
        }),
      );

      const events = [
        {
          attendanceId: attendance.id,
          type: AttendanceEventType.CHECK_IN,
          reason: null as CheckOutReason | null,
          occurredAt: checkInAt,
          receivedAt: new Date(),
          source,
          deviceId: null,
          idempotencyKey: null,
          createdBy: actor.id,
        },
      ];
      if (breakOutAt) {
        events.push({
          attendanceId: attendance.id,
          type: AttendanceEventType.CHECK_OUT,
          reason: CheckOutReason.BREAK,
          occurredAt: breakOutAt,
          receivedAt: new Date(),
          source,
          deviceId: null,
          idempotencyKey: null,
          createdBy: actor.id,
        });
      }
      if (breakInAt) {
        events.push({
          attendanceId: attendance.id,
          type: AttendanceEventType.CHECK_IN,
          reason: null,
          occurredAt: breakInAt,
          receivedAt: new Date(),
          source,
          deviceId: null,
          idempotencyKey: null,
          createdBy: actor.id,
        });
      }
      events.push({
        attendanceId: attendance.id,
        type: AttendanceEventType.CHECK_OUT,
        reason: CheckOutReason.SHIFT_END,
        occurredAt: checkOutAt,
        receivedAt: new Date(),
        source,
        deviceId: null,
        idempotencyKey: null,
        createdBy: actor.id,
      });

      await manager.getRepository(AttendanceEvent).save(events);
      await this.rebuildSessionsAndMetrics(
        attendance.id,
        manager.getRepository(Attendance),
        manager.getRepository(AttendanceEvent),
        manager.getRepository(AttendanceSession),
      );
      return attendance.id;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Attendance',
        entityId: saved,
        record: `${employee.user?.name ?? employee.id} @ ${attendanceDate}`,
        description: `Manual attendance entry for ${attendanceDate}`,
      },
      activity,
    );

    if (dto.notifyEmployee) {
      await this.notifyEmployee(employee, 'Manual attendance recorded', `Your attendance for ${attendanceDate} was entered by HR.`, saved);
    }

    return this.findOne(saved);
  }

  async checkIn(dto: PunchAttendanceDto, actor: User, activity?: ActivityActorContext) {
    return this.punch(AttendanceEventType.CHECK_IN, dto, actor, activity);
  }

  async checkOut(dto: PunchAttendanceDto, actor: User, activity?: ActivityActorContext) {
    return this.punch(AttendanceEventType.CHECK_OUT, dto, actor, activity);
  }

  async breakStart(dto: PunchAttendanceDto, actor: User, activity?: ActivityActorContext) {
    return this.punch(AttendanceEventType.CHECK_OUT, {
      ...dto,
      reason: CheckOutReason.BREAK,
    }, actor, activity);
  }

  async breakEnd(dto: PunchAttendanceDto, actor: User, activity?: ActivityActorContext) {
    return this.punch(AttendanceEventType.CHECK_IN, dto, actor, activity);
  }

  async adjust(
    id: string,
    dto: AdjustAttendanceDto,
    actor: User,
    activity?: ActivityActorContext,
  ) {
    const attendance = await this.attendanceRepo.findOne({
      where: { id },
      relations: { employee: { user: true, shift: true } },
    });
    if (!attendance) throw new NotFoundException('Attendance not found');

    const oldValue = {
      firstCheckIn: attendance.firstCheckIn,
      lastCheckOut: attendance.lastCheckOut,
      breakOutAt: attendance.breakOutAt,
      breakInAt: attendance.breakInAt,
      workLocation: attendance.workLocation,
      status: attendance.status,
      notes: attendance.notes,
    };

    const date = attendance.attendanceDate;
    if (dto.checkInAt !== undefined) {
      attendance.firstCheckIn = this.resolveDateTime(date, dto.checkInAt);
    }
    if (dto.checkOutAt !== undefined) {
      attendance.lastCheckOut = this.resolveDateTime(
        date,
        dto.checkOutAt,
        true,
        attendance.firstCheckIn ?? undefined,
      );
    }
    if (dto.breakOutAt !== undefined) {
      attendance.breakOutAt = dto.breakOutAt
        ? this.resolveDateTime(date, dto.breakOutAt)
        : null;
    }
    if (dto.breakInAt !== undefined) {
      attendance.breakInAt = dto.breakInAt
        ? this.resolveDateTime(date, dto.breakInAt)
        : null;
    }
    if (dto.workLocation !== undefined) {
      attendance.workLocation = dto.workLocation?.trim() || null;
    }
    if (dto.status !== undefined) {
      attendance.status = dto.status;
    }
    attendance.notes = [attendance.notes, dto.reason].filter(Boolean).join(' | ');
    attendance.source = AttendanceSource.ADMIN;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Attendance).save(attendance);
      await manager.getRepository(AttendanceAdjustment).save(
        manager.getRepository(AttendanceAdjustment).create({
          attendanceId: id,
          originalEventId: null,
          oldValue: oldValue as unknown as Record<string, unknown>,
          newValue: {
            firstCheckIn: attendance.firstCheckIn,
            lastCheckOut: attendance.lastCheckOut,
            breakOutAt: attendance.breakOutAt,
            breakInAt: attendance.breakInAt,
            workLocation: attendance.workLocation,
            status: attendance.status,
          },
          reason: dto.reason,
          requestedBy: actor.id,
          approvedBy: actor.id,
          status: AdjustmentStatus.APPROVED,
        }),
      );

      // Rebuild events from adjusted punches for session calc
      await manager.getRepository(AttendanceEvent).delete({ attendanceId: id });
      const source = AttendanceSource.ADMIN;
      const events: Partial<AttendanceEvent>[] = [];
      if (attendance.firstCheckIn) {
        events.push({
          attendanceId: id,
          type: AttendanceEventType.CHECK_IN,
          reason: null,
          occurredAt: attendance.firstCheckIn,
          receivedAt: new Date(),
          source,
          createdBy: actor.id,
        });
      }
      if (attendance.breakOutAt) {
        events.push({
          attendanceId: id,
          type: AttendanceEventType.CHECK_OUT,
          reason: CheckOutReason.BREAK,
          occurredAt: attendance.breakOutAt,
          receivedAt: new Date(),
          source,
          createdBy: actor.id,
        });
      }
      if (attendance.breakInAt) {
        events.push({
          attendanceId: id,
          type: AttendanceEventType.CHECK_IN,
          reason: null,
          occurredAt: attendance.breakInAt,
          receivedAt: new Date(),
          source,
          createdBy: actor.id,
        });
      }
      if (attendance.lastCheckOut) {
        events.push({
          attendanceId: id,
          type: AttendanceEventType.CHECK_OUT,
          reason: CheckOutReason.SHIFT_END,
          occurredAt: attendance.lastCheckOut,
          receivedAt: new Date(),
          source,
          createdBy: actor.id,
        });
      }
      if (events.length) {
        await manager.getRepository(AttendanceEvent).save(events);
      }

      await this.rebuildSessionsAndMetrics(
        id,
        manager.getRepository(Attendance),
        manager.getRepository(AttendanceEvent),
        manager.getRepository(AttendanceSession),
        dto.status,
      );
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Attendance',
        entityId: id,
        record: attendance.attendanceDate,
        description: `Adjusted attendance: ${dto.reason}`,
      },
      activity,
    );

    if (dto.notifyEmployee && attendance.employee) {
      await this.notifyEmployee(
        attendance.employee,
        'Attendance adjusted',
        `Your attendance for ${attendance.attendanceDate} was adjusted.`,
        id,
      );
    }

    return this.findOne(id);
  }

  async findOne(id: string) {
    const row = await this.attendanceRepo.findOne({
      where: { id },
      relations: {
        employee: { user: true, department: true, shift: true },
      },
    });
    if (!row) throw new NotFoundException('Attendance not found');
    const events = await this.eventRepo.find({
      where: { attendanceId: id },
      order: { occurredAt: 'ASC' },
    });
    const sessions = await this.sessionRepo.find({
      where: { attendanceId: id },
      order: { startAt: 'ASC' },
    });
    return this.toDetailResponse(row, events, sessions);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const row = await this.attendanceRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Attendance not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AttendanceSession).delete({ attendanceId: id });
      await manager.getRepository(AttendanceEvent).delete({ attendanceId: id });
      await manager.getRepository(AttendanceAdjustment).delete({ attendanceId: id });
      await manager.getRepository(Attendance).delete(id);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Attendance',
        entityId: id,
        record: row.attendanceDate,
        description: `Deleted attendance for ${row.attendanceDate}`,
      },
      activity,
    );

    return { message: 'Attendance deleted' };
  }

  // ── Punch internals ───────────────────────────────────────

  private async punch(
    type: AttendanceEventType,
    dto: PunchAttendanceDto,
    actor: User,
    activity?: ActivityActorContext,
  ) {
    const employee = await this.resolveEmployee(actor, dto.employeeId);
    const attendanceDate = this.normalizeDate(
      dto.attendanceDate ?? new Date().toISOString().slice(0, 10),
    );
    const occurredAt = dto.occurredAt
      ? this.resolveDateTime(attendanceDate, dto.occurredAt)
      : new Date();
    const source = dto.source ?? AttendanceSource.MOBILE;

    if (dto.idempotencyKey) {
      const dup = await this.eventRepo.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (dup) {
        return this.findOne(dup.attendanceId);
      }
    }

    let attendance = await this.attendanceRepo.findOne({
      where: { employeeId: employee.id, attendanceDate },
      relations: { employee: { shift: true } },
    });

    if (!attendance) {
      if (!employee.shiftId) {
        throw new BadRequestException(
          'No shift assigned to this employee; set employee.shiftId first',
        );
      }
      const shift = await this.loadActiveShift(employee.shiftId);
      const day = buildDayScheduleFromShift(attendanceDate, shift);
      attendance = await this.attendanceRepo.save(
        this.attendanceRepo.create({
          employeeId: employee.id,
          attendanceDate,
          scheduledStartAt: day.scheduledStartAt,
          scheduledEndAt: day.scheduledEndAt,
          policySnapshot: day.policySnapshot as Record<string, unknown>,
          firstCheckIn: null,
          lastCheckOut: null,
          breakOutAt: null,
          breakInAt: null,
          source,
          workLocation: dto.workLocation?.trim() || null,
          notes: null,
          leaveType: null,
          status: AttendanceStatus.INCOMPLETE,
          calculationStatus: CalculationStatus.OPEN,
          calculationVersion: 1,
        }),
      );
    }

    if (attendance.status === AttendanceStatus.ON_LEAVE) {
      throw new ConflictException('Cannot punch on a leave day');
    }

    // Validate punch sequence
    const lastEvent = await this.eventRepo.findOne({
      where: { attendanceId: attendance.id },
      order: { occurredAt: 'DESC' },
    });

    if (type === AttendanceEventType.CHECK_IN) {
      if (lastEvent?.type === AttendanceEventType.CHECK_IN) {
        throw new BadRequestException('Already checked in');
      }
    } else {
      if (!lastEvent || lastEvent.type !== AttendanceEventType.CHECK_IN) {
        throw new BadRequestException('Must check in before check-out / break');
      }
    }

    const reason =
      type === AttendanceEventType.CHECK_OUT
        ? (dto.reason ?? CheckOutReason.SHIFT_END)
        : null;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AttendanceEvent).save(
        manager.getRepository(AttendanceEvent).create({
          attendanceId: attendance!.id,
          type,
          reason,
          occurredAt,
          receivedAt: new Date(),
          source,
          deviceId: dto.deviceId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdBy: actor.id,
        }),
      );

      const attRepo = manager.getRepository(Attendance);
      const att = await attRepo.findOne({ where: { id: attendance!.id } });
      if (!att) return;

      if (type === AttendanceEventType.CHECK_IN) {
        if (!att.firstCheckIn) att.firstCheckIn = occurredAt;
        if (att.breakOutAt && !att.breakInAt) att.breakInAt = occurredAt;
      } else if (reason === CheckOutReason.BREAK) {
        att.breakOutAt = occurredAt;
      } else {
        att.lastCheckOut = occurredAt;
      }
      if (dto.workLocation) att.workLocation = dto.workLocation.trim();
      att.source = source;
      await attRepo.save(att);

      await this.rebuildSessionsAndMetrics(
        att.id,
        attRepo,
        manager.getRepository(AttendanceEvent),
        manager.getRepository(AttendanceSession),
      );
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Attendance',
        entityId: attendance.id,
        record: `${type} ${attendanceDate}`,
        description: `${type} at ${occurredAt.toISOString()}`,
      },
      activity,
    );

    return this.findOne(attendance.id);
  }

  async rebuildSessionsAndMetrics(
    attendanceId: string,
    attRepo = this.attendanceRepo,
    eventRepo = this.eventRepo,
    sessionRepo = this.sessionRepo,
    forceStatus?: AttendanceStatus,
  ) {
    const attendance = await attRepo.findOne({
      where: { id: attendanceId },
    });
    if (!attendance) return;

    const events = await eventRepo.find({
      where: { attendanceId },
      order: { occurredAt: 'ASC' },
    });

    await sessionRepo.delete({ attendanceId });

    const sessions: Partial<AttendanceSession>[] = [];
    let openCheckIn: Date | null = null;
    let openReason: CheckOutReason | null = null;
    let breakMinutes = 0;
    let firstCheckIn: Date | null = null;
    let lastCheckOut: Date | null = null;
    let breakOutAt: Date | null = null;
    let breakInAt: Date | null = null;

    for (const ev of events) {
      if (ev.type === AttendanceEventType.CHECK_IN) {
        if (!firstCheckIn) firstCheckIn = ev.occurredAt;
        if (openReason === CheckOutReason.BREAK && openCheckIn) {
          // closing break — breakIn
          breakInAt = ev.occurredAt;
        }
        openCheckIn = ev.occurredAt;
        openReason = null;
      } else {
        if (!openCheckIn) continue;
        const duration = minutesBetween(openCheckIn, ev.occurredAt);
        const isBreak = ev.reason === CheckOutReason.BREAK;
        sessions.push({
          attendanceId,
          type: isBreak ? SessionType.BREAK : SessionType.WORK,
          startAt: openCheckIn,
          endAt: ev.occurredAt,
          durationMinutes: duration,
          eligibleMinutes: isBreak ? 0 : duration,
        });
        if (isBreak) {
          breakMinutes += duration;
          breakOutAt = openCheckIn;
        } else {
          lastCheckOut = ev.occurredAt;
        }
        openCheckIn = null;
        openReason = ev.reason;
      }
    }

    if (sessions.length) {
      await sessionRepo.save(sessions);
    }

    const policy = readPolicySnapshot(attendance.policySnapshot);
    const metrics = calculateAttendanceMetrics({
      scheduledStartAt: attendance.scheduledStartAt,
      scheduledEndAt: attendance.scheduledEndAt,
      requiredWorkMinutes: policy.requiredWorkMinutes,
      graceMinutes: policy.graceMinutes,
      allowedBreakMinutes: policy.allowedBreakMinutes,
      breakPaid: policy.breakPaid,
      excessDeductible: policy.excessDeductible,
      firstCheckIn,
      lastCheckOut,
      breakMinutes,
    });

    Object.assign(attendance, {
      firstCheckIn,
      lastCheckOut,
      breakOutAt: breakOutAt ?? attendance.breakOutAt,
      breakInAt: breakInAt ?? attendance.breakInAt,
      workedMinutes: metrics.workedMinutes,
      allowedBreakMinutes: metrics.allowedBreakMinutes,
      excessBreakMinutes: metrics.excessBreakMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      shortfallMinutes: metrics.shortfallMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      provisionalDeductionMinutes: metrics.provisionalDeductionMinutes,
      status: forceStatus ?? metrics.status,
      calculationStatus: metrics.calculationStatus,
      calculationVersion: (attendance.calculationVersion ?? 1) + 1,
    });

    // Preserve leave status
    if (attendance.leaveType && !forceStatus) {
      attendance.status = AttendanceStatus.ON_LEAVE;
    }

    await attRepo.save(attendance);
  }

  // ── Helpers ───────────────────────────────────────────────

  private async resolveEmployee(actor: User, employeeId?: string) {
    if (employeeId) {
      return this.ensureEmployee(employeeId);
    }
    const self = await this.employeeRepo.findOne({
      where: { userId: actor.id },
      relations: { user: true },
    });
    if (!self) {
      throw new BadRequestException('No employee profile linked to this user');
    }
    return self;
  }

  private async ensureEmployee(employeeId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      relations: { user: true, department: true, shift: true },
    });
    if (!employee) throw new BadRequestException('Employee not found');
    if (!employee.attendanceEnabled) {
      throw new BadRequestException('Attendance is disabled for this employee');
    }
    return employee;
  }

  private async loadActiveShift(shiftId: string) {
    const shift = await this.shiftRepo.findOne({
      where: { id: shiftId },
      relations: { breakPolicy: true },
    });
    if (!shift) throw new BadRequestException('Shift not found');
    if (!shift.isActive) throw new BadRequestException('Shift is inactive');
    if (!shift.breakPolicy) {
      throw new BadRequestException('Shift break policy not found');
    }
    return shift as Shift & { breakPolicy: BreakPolicy };
  }

  private normalizeDate(value: string) {
    const date = value.slice(0, 10);
    if (!parseIsoDate(date)) {
      throw new BadRequestException('Invalid date; expected YYYY-MM-DD');
    }
    return date;
  }

  private resolveDateTime(
    workDate: string,
    value: string,
    allowNextDay = false,
    after?: Date,
  ): Date {
    let dt: Date;
    if (value.includes('T')) {
      dt = new Date(value);
    } else {
      dt = combineDateAndTime(workDate, value);
    }
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(`Invalid datetime: ${value}`);
    }
    if (allowNextDay && after && dt <= after) {
      dt = new Date(dt.getTime() + 86_400_000);
    }
    return dt;
  }

  private async notifyEmployee(
    employee: Employee,
    title: string,
    message: string,
    entityId: string,
  ) {
    if (!employee.userId) return;
    await this.notificationsService.createNotification({
      type: NotificationType.ATTENDANCE_UPDATE,
      module: NotificationModuleCode.HR,
      severity: NotificationSeverity.INFO,
      title,
      message,
      entityType: NotificationEntityType.ATTENDANCE,
      entityId,
      eventKey: `attendance:${entityId}:${Date.now()}`,
      recipientUserIds: [employee.userId],
    });
  }

  toListItem(row: Attendance) {
    const user = row.employee?.user;
    const empShift = row.employee?.shift;
    const snapShift = (
      row.policySnapshot as {
        shift?: { id?: string; name?: string; startTime?: string; endTime?: string };
      } | null
    )?.shift;
    return {
      id: row.id,
      employeeId: row.employeeId,
      attendanceDate: row.attendanceDate,
      checkIn: row.firstCheckIn,
      checkOut: row.lastCheckOut,
      breakOut: row.breakOutAt,
      breakIn: row.breakInAt,
      workedMinutes: row.workedMinutes,
      overtimeMinutes: row.overtimeMinutes,
      lateMinutes: row.lateMinutes,
      status: row.status,
      source: row.source,
      workLocation: row.workLocation,
      notes: row.notes,
      leaveType: row.leaveType,
      employee: row.employee
        ? {
            id: row.employee.id,
            name: user?.name ?? null,
            userCode: user?.code ?? null,
            designation: row.employee.designation ?? null,
            departmentId: row.employee.departmentId ?? null,
            departmentName: row.employee.department?.name ?? null,
            roleId: user?.roleId ?? user?.role?.id ?? null,
            roleName: user?.role?.name ?? null,
            shiftId: row.employee.shiftId ?? null,
          }
        : null,
      // Shift comes from employee (or frozen policy snapshot) — not an attendance column.
      shift: empShift
        ? {
            id: empShift.id,
            name: empShift.name,
            startTime: empShift.startTime,
            endTime: empShift.endTime,
          }
        : snapShift
          ? {
              id: snapShift.id ?? null,
              name: snapShift.name ?? null,
              startTime: snapShift.startTime ?? null,
              endTime: snapShift.endTime ?? null,
            }
          : null,
    };
  }

  private toDetailResponse(
    row: Attendance,
    events: AttendanceEvent[],
    sessions: AttendanceSession[],
  ) {
    return {
      ...this.toListItem(row),
      shiftId: row.employee?.shiftId ?? null,
      scheduledStartAt: row.scheduledStartAt ?? null,
      scheduledEndAt: row.scheduledEndAt ?? null,
      allowedBreakMinutes: row.allowedBreakMinutes,
      excessBreakMinutes: row.excessBreakMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      shortfallMinutes: row.shortfallMinutes,
      provisionalDeductionMinutes: row.provisionalDeductionMinutes,
      calculationStatus: row.calculationStatus,
      calculationVersion: row.calculationVersion,
      policySnapshot: row.policySnapshot ?? null,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        reason: e.reason,
        occurredAt: e.occurredAt,
        source: e.source,
        deviceId: e.deviceId,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        type: s.type,
        startAt: s.startAt,
        endAt: s.endAt,
        durationMinutes: s.durationMinutes,
      })),
    };
  }
}
