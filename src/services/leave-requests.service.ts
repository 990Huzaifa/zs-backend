import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MarkLeaveDto,
  UpsertLeaveBalanceDto,
} from '../auth/dto/attendance.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  NotificationEntityType,
  NotificationModuleCode,
  NotificationType,
} from '../common/notifications/notification.constants';
import {
  buildDayScheduleFromShift,
  enumerateDates,
  readPolicySnapshot,
} from '../common/utils/attendance.util';
import { countInclusiveDays, parseIsoDate } from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  Attendance,
  AttendanceStatus,
  AttendanceSource,
  CalculationStatus,
} from '../database/entities/hr/attendance.entity';
import { Employee } from '../database/entities/hr/employee.entity';
import {
  LeaveBalance,
  LeaveDurationType,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveType,
} from '../database/entities/hr/leave.entity';
import { BreakPolicy, Shift } from '../database/entities/hr/shift.entity';
import { NotificationSeverity } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { NotificationsService } from './notifications.service';

const DEFAULT_ENTITLED: Record<string, number> = {
  [LeaveType.ANNUAL]: 12,
  [LeaveType.SICK]: 8,
  [LeaveType.CASUAL]: 6,
  [LeaveType.COMP_OFF]: 0,
  [LeaveType.UNPAID]: 365,
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async markLeave(dto: MarkLeaveDto, actor: User, activity?: ActivityActorContext) {
    const startDate = this.normalizeDate(dto.startDate);
    const endDate = this.normalizeDate(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const dayCount = countInclusiveDays(startDate, endDate);
    if (dayCount < 1 || dayCount > 93) {
      throw new BadRequestException('Leave range must be between 1 and 93 days');
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId },
      relations: { user: true, department: true, shift: { breakPolicy: true } },
    });
    if (!employee) throw new BadRequestException('Employee not found');
    if (!employee.shiftId) {
      throw new BadRequestException(
        'Employee has no shift assigned; set employee.shiftId first',
      );
    }

    const durationType = dto.durationType ?? LeaveDurationType.FULL_DAY;
    const days =
      durationType === LeaveDurationType.HALF_DAY ? dayCount * 0.5 : dayCount;

    if (dto.leaveType !== LeaveType.UNPAID) {
      const year = Number(startDate.slice(0, 4));
      const balance = await this.ensureBalance(
        employee.id,
        year,
        dto.leaveType,
      );
      const remaining =
        Number(balance.entitledDays) - Number(balance.usedDays);
      if (days > remaining) {
        throw new BadRequestException(
          `Insufficient leave balance (${remaining} day(s) remaining)`,
        );
      }
    }

    const dates = enumerateDates(startDate, endDate);
    const conflict = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId: employee.id })
      .andWhere('a.attendanceDate IN (:...dates)', { dates })
      .andWhere('a.status NOT IN (:...ok)', {
        ok: [AttendanceStatus.ABSENT, AttendanceStatus.WEEKLY_OFF],
      })
      .getOne();
    if (conflict && conflict.status !== AttendanceStatus.ON_LEAVE) {
      // Allow overwrite only if incomplete/absent; block present/late punches
      if (
        [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY, AttendanceStatus.INCOMPLETE].includes(
          conflict.status as AttendanceStatus,
        ) &&
        conflict.firstCheckIn
      ) {
        throw new BadRequestException(
          `Attendance already punched on ${conflict.attendanceDate}; adjust/delete first`,
        );
      }
    }

    const leave = await this.leaveRepo.save(
      this.leaveRepo.create({
        employeeId: employee.id,
        leaveType: dto.leaveType,
        durationType,
        startDate,
        endDate,
        days,
        reason: dto.reason.trim(),
        attachmentUrl: dto.attachmentUrl ?? null,
        approverUserId: dto.approverUserId ?? actor.id,
        status: LeaveRequestStatus.APPROVED,
        createdBy: actor.id,
        notifyEmployee: dto.notifyEmployee ?? false,
      }),
    );

    // Freeze employee's current shift onto each leave day attendance
    let shift = employee.shift as (Shift & { breakPolicy: BreakPolicy }) | null | undefined;
    if (!shift?.breakPolicy) {
      shift = (await this.shiftRepo.findOne({
        where: { id: employee.shiftId },
        relations: { breakPolicy: true },
      })) as (Shift & { breakPolicy: BreakPolicy }) | null;
    }
    if (!shift?.breakPolicy) {
      throw new BadRequestException('Employee shift / break policy not found');
    }

    for (const workDate of dates) {
      const day = buildDayScheduleFromShift(workDate, shift);
      let attendance = await this.attendanceRepo.findOne({
        where: { employeeId: employee.id, attendanceDate: workDate },
      });
      if (!attendance) {
        attendance = this.attendanceRepo.create({
          employeeId: employee.id,
          shiftId: day.shiftId,
          attendanceDate: workDate,
          scheduledStartAt: day.scheduledStartAt,
          scheduledEndAt: day.scheduledEndAt,
          policySnapshot: day.policySnapshot as Record<string, unknown>,
          firstCheckIn: null,
          lastCheckOut: null,
          breakOutAt: null,
          breakInAt: null,
          workedMinutes: 0,
          allowedBreakMinutes: readPolicySnapshot(
            day.policySnapshot as Record<string, unknown>,
          ).allowedBreakMinutes,
          status: AttendanceStatus.ON_LEAVE,
          calculationStatus: CalculationStatus.CALCULATED,
          source: AttendanceSource.ADMIN,
          notes: dto.reason.trim(),
          leaveType: dto.leaveType,
        });
      } else {
        attendance.status = AttendanceStatus.ON_LEAVE;
        attendance.leaveType = dto.leaveType;
        attendance.notes = dto.reason.trim();
        attendance.firstCheckIn = null;
        attendance.lastCheckOut = null;
        attendance.workedMinutes = 0;
        attendance.lateMinutes = 0;
        attendance.overtimeMinutes = 0;
        attendance.shortfallMinutes = 0;
        attendance.calculationStatus = CalculationStatus.CALCULATED;
      }
      await this.attendanceRepo.save(attendance);
    }

    if (dto.leaveType !== LeaveType.UNPAID) {
      const year = Number(startDate.slice(0, 4));
      const balance = await this.ensureBalance(employee.id, year, dto.leaveType);
      balance.usedDays = Number(balance.usedDays) + days;
      await this.balanceRepo.save(balance);
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'LeaveRequest',
        entityId: leave.id,
        record: `${employee.user?.name ?? employee.id} ${startDate}→${endDate}`,
        description: `Marked ${dto.leaveType} leave (${days} day(s))`,
      },
      activity,
    );

    if (dto.notifyEmployee && employee.userId) {
      await this.notificationsService.createNotification({
        type: NotificationType.LEAVE_MARKED,
        module: NotificationModuleCode.HR,
        severity: NotificationSeverity.INFO,
        title: 'Leave marked',
        message: `${dto.leaveType} leave marked for ${startDate} to ${endDate}`,
        entityType: NotificationEntityType.LEAVE_REQUEST,
        entityId: leave.id,
        eventKey: `leave:${leave.id}`,
        recipientUserIds: [employee.userId],
      });
    }

    return this.findOne(leave.id);
  }

  async findOne(id: string) {
    const leave = await this.leaveRepo.findOne({
      where: { id },
      relations: { employee: { user: true, department: true } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    return this.toResponse(leave);
  }

  async getBalance(employeeId: string, year?: number) {
    const y = year ?? new Date().getUTCFullYear();
    await this.ensureEmployee(employeeId);
    const types = Object.values(LeaveType).filter((t) => t !== LeaveType.UNPAID);
    const rows: LeaveBalance[] = [];
    for (const leaveType of types) {
      rows.push(await this.ensureBalance(employeeId, y, leaveType));
    }
    return {
      employeeId,
      year: y,
      data: rows.map((b) => ({
        leaveType: b.leaveType,
        entitledDays: Number(b.entitledDays),
        usedDays: Number(b.usedDays),
        remainingDays: Number(b.entitledDays) - Number(b.usedDays),
      })),
    };
  }

  async upsertBalance(dto: UpsertLeaveBalanceDto, activity?: ActivityActorContext) {
    await this.ensureEmployee(dto.employeeId);
    let balance = await this.balanceRepo.findOne({
      where: {
        employeeId: dto.employeeId,
        year: dto.year,
        leaveType: dto.leaveType,
      },
    });
    if (!balance) {
      balance = this.balanceRepo.create({
        employeeId: dto.employeeId,
        year: dto.year,
        leaveType: dto.leaveType,
        entitledDays: dto.entitledDays,
        usedDays: dto.usedDays ?? 0,
      });
    } else {
      balance.entitledDays = dto.entitledDays;
      if (dto.usedDays !== undefined) balance.usedDays = dto.usedDays;
    }
    await this.balanceRepo.save(balance);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'LeaveBalance',
        entityId: balance.id,
        record: `${dto.leaveType} ${dto.year}`,
        description: `Upserted leave balance for ${dto.leaveType}`,
      },
      activity,
    );
    return {
      leaveType: balance.leaveType,
      entitledDays: Number(balance.entitledDays),
      usedDays: Number(balance.usedDays),
      remainingDays: Number(balance.entitledDays) - Number(balance.usedDays),
    };
  }

  private async ensureBalance(
    employeeId: string,
    year: number,
    leaveType: string,
  ) {
    let balance = await this.balanceRepo.findOne({
      where: { employeeId, year, leaveType },
    });
    if (!balance) {
      balance = await this.balanceRepo.save(
        this.balanceRepo.create({
          employeeId,
          year,
          leaveType,
          entitledDays: DEFAULT_ENTITLED[leaveType] ?? 12,
          usedDays: 0,
        }),
      );
    }
    return balance;
  }

  private async ensureEmployee(employeeId: string) {
    const exists = await this.employeeRepo.exist({ where: { id: employeeId } });
    if (!exists) throw new BadRequestException('Employee not found');
  }

  private normalizeDate(value: string) {
    const date = value.slice(0, 10);
    if (!parseIsoDate(date)) {
      throw new BadRequestException('Invalid date; expected YYYY-MM-DD');
    }
    return date;
  }

  private toResponse(leave: LeaveRequest) {
    return {
      id: leave.id,
      employeeId: leave.employeeId,
      leaveType: leave.leaveType,
      durationType: leave.durationType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: Number(leave.days),
      reason: leave.reason,
      attachmentUrl: leave.attachmentUrl,
      approverUserId: leave.approverUserId,
      status: leave.status,
      createdBy: leave.createdBy,
      notifyEmployee: leave.notifyEmployee,
      createdAt: leave.createdAt,
      employee: leave.employee
        ? {
            id: leave.employee.id,
            name: leave.employee.user?.name ?? null,
            userCode: leave.employee.user?.code ?? null,
            departmentName: leave.employee.department?.name ?? null,
          }
        : null,
    };
  }
}
