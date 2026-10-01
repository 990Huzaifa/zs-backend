import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceDashboardQueryDto,
  AttendanceListQueryDto,
  EmployeeAttendanceDetailQueryDto,
} from '../auth/dto/attendance.dto';
import {
  addDays,
  formatDuration,
  monthBounds,
  startOfWeekMonday,
} from '../common/utils/attendance.util';
import { parseIsoDate } from '../common/utils/payroll.util';
import {
  Attendance,
  AttendanceStatus,
} from '../database/entities/hr/attendance.entity';
import { Employee } from '../database/entities/hr/employee.entity';
import { LeaveType } from '../database/entities/hr/leave.entity';
import { AttendancesService } from './attendances.service';
import { LeaveRequestsService } from './leave-requests.service';

@Injectable()
export class AttendanceDashboardService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly attendancesService: AttendancesService,
    private readonly leaveRequestsService: LeaveRequestsService,
  ) {}

  async dashboard(query: AttendanceDashboardQueryDto) {
    const { fromDate, toDate, focusDate } = this.resolveRange(query);
    const listQuery: AttendanceListQueryDto = {
      page: query.page,
      limit: query.limit,
      search: query.search,
      departmentId: query.departmentId,
      roleId: query.roleId,
      status: query.status,
      fromDate: focusDate,
      toDate: focusDate,
    };

    const [summary, weeklyTrend, departmentBreakdown, heatmap, table] =
      await Promise.all([
        this.summaryForDate(focusDate, query),
        this.weeklyTrend(fromDate, query),
        this.departmentBreakdown(focusDate, query),
        this.monthlyHeatmap(focusDate, query),
        this.listAttendances(listQuery),
      ]);

    return {
      range: { fromDate, toDate, focusDate, preset: query.preset ?? null },
      summary,
      weeklyTrend,
      departmentBreakdown,
      heatmap,
      table,
    };
  }

  async employeeDetail(
    employeeId: string,
    query: EmployeeAttendanceDetailQueryDto,
  ) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      relations: { user: { role: true }, department: true, shift: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const { fromDate, toDate } = this.resolveRange(query);
    const rows = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.attendanceDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      })
      .orderBy('a.attendanceDate', 'DESC')
      .getMany();

    const presentDays = rows.filter((r) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
        r.status as AttendanceStatus,
      ),
    ).length;
    const absentDays = rows.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;
    const lateDays = rows.filter(
      (r) => r.status === AttendanceStatus.LATE || r.lateMinutes > 0,
    ).length;
    const leaveDays = rows.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;
    const totalWorked = rows.reduce((s, r) => s + (r.workedMinutes || 0), 0);
    const totalOt = rows.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
    const totalDays = Math.max(1, rows.length);
    const attendanceRate = Math.round((presentDays / totalDays) * 100);
    const punctualDays = rows.filter(
      (r) =>
        [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
          r.status as AttendanceStatus,
        ) && r.lateMinutes === 0,
    ).length;
    const punctualityScore =
      presentDays > 0 ? Math.round((punctualDays / presentDays) * 100) : 0;

    // Previous period comparison (same length ending day before fromDate)
    const periodLen =
      Math.floor(
        (new Date(`${toDate}T00:00:00.000Z`).getTime() -
          new Date(`${fromDate}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1;
    const prevTo = addDays(fromDate, -1);
    const prevFrom = addDays(prevTo, -(periodLen - 1));
    const prevRows = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.attendanceDate BETWEEN :fromDate AND :toDate', {
        fromDate: prevFrom,
        toDate: prevTo,
      })
      .getMany();
    const prevPresent = prevRows.filter((r) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
        r.status as AttendanceStatus,
      ),
    ).length;
    const prevRate =
      prevRows.length > 0
        ? Math.round((prevPresent / prevRows.length) * 100)
        : 0;
    const prevPunctual = prevRows.filter(
      (r) =>
        [AttendanceStatus.PRESENT, AttendanceStatus.LATE].includes(
          r.status as AttendanceStatus,
        ) && r.lateMinutes === 0,
    ).length;
    const prevPresentCount = prevRows.filter((r) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
        r.status as AttendanceStatus,
      ),
    ).length;
    const prevPunctuality =
      prevPresentCount > 0
        ? Math.round((prevPunctual / prevPresentCount) * 100)
        : 0;

    const calendar = rows.map((r) => ({
      date: r.attendanceDate,
      status: r.status,
      lateMinutes: r.lateMinutes,
    }));

    const checkInOutTrend = rows
      .slice()
      .reverse()
      .filter((r) => r.firstCheckIn || r.lastCheckOut)
      .map((r) => ({
        date: r.attendanceDate,
        checkIn: r.firstCheckIn,
        checkOut: r.lastCheckOut,
      }));

    const history = rows.map((r) => ({
      id: r.id,
      date: r.attendanceDate,
      day: new Date(`${r.attendanceDate}T00:00:00.000Z`).toLocaleDateString(
        'en-US',
        { weekday: 'short', timeZone: 'UTC' },
      ),
      checkIn: r.firstCheckIn,
      breakOut: r.breakOutAt,
      breakIn: r.breakInAt,
      checkOut: r.lastCheckOut,
      totalHours: formatDuration(r.workedMinutes),
      workedMinutes: r.workedMinutes,
      overtime: formatDuration(r.overtimeMinutes),
      overtimeMinutes: r.overtimeMinutes,
      status: r.status,
      lateBy: r.lateMinutes > 0 ? `${r.lateMinutes} minutes` : null,
      lateMinutes: r.lateMinutes,
      notes: r.notes,
      leaveType: r.leaveType,
    }));

    const recentActivity = rows.slice(0, 15).flatMap((r) => {
      const items: Array<{
        type: string;
        message: string;
        at: Date | string;
        status: string;
      }> = [];
      if (r.status === AttendanceStatus.ON_LEAVE) {
        items.push({
          type: 'LEAVE',
          message: `On approved ${r.leaveType ?? 'leave'}`,
          at: r.attendanceDate,
          status: r.status,
        });
      } else if (r.status === AttendanceStatus.ABSENT) {
        items.push({
          type: 'ABSENT',
          message: 'Marked absent — no check-in recorded',
          at: r.attendanceDate,
          status: r.status,
        });
      }
      if (r.firstCheckIn) {
        items.push({
          type: 'CHECK_IN',
          message:
            r.lateMinutes > 0
              ? `Checked in late (${r.lateMinutes} min)${r.workLocation ? ` at ${r.workLocation}` : ''}`
              : `Checked in${r.workLocation ? ` at ${r.workLocation}` : ''}`,
          at: r.firstCheckIn,
          status: r.lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        });
      }
      if (r.lastCheckOut) {
        items.push({
          type: 'CHECK_OUT',
          message: `Checked out${r.workLocation ? ` from ${r.workLocation}` : ''}`,
          at: r.lastCheckOut,
          status: r.status,
        });
      }
      return items;
    });

    const currentShift = employee.shift;

    const balance = await this.leaveRequestsService.getBalance(
      employeeId,
      Number(fromDate.slice(0, 4)),
    );
    const annual = balance.data.find((b) => b.leaveType === LeaveType.ANNUAL);

    return {
      range: { fromDate, toDate, preset: query.preset ?? null },
      employee: {
        id: employee.id,
        name: employee.user?.name ?? null,
        userCode: employee.user?.code ?? null,
        designation: employee.designation ?? null,
        departmentId: employee.departmentId ?? null,
        departmentName: employee.department?.name ?? null,
        roleName: employee.user?.role?.name ?? null,
        employmentType: employee.employmentType,
        joiningDate: employee.joiningDate ?? null,
        attendanceEnabled: employee.attendanceEnabled,
        shiftId: employee.shiftId ?? null,
      },
      shift: currentShift
        ? {
            id: currentShift.id,
            name: currentShift.name,
            startTime: currentShift.startTime,
            endTime: currentShift.endTime,
            requiredWorkMinutes: currentShift.requiredWorkMinutes,
            label: `${currentShift.name}, ${Math.round(currentShift.requiredWorkMinutes / 60)} hours`,
          }
        : null,
      summary: {
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        totalHours: formatDuration(totalWorked),
        totalWorkedMinutes: totalWorked,
        overtime: formatDuration(totalOt),
        overtimeMinutes: totalOt,
        presentPercent: Math.round((presentDays / totalDays) * 100),
        absentPercent: Math.round((absentDays / totalDays) * 100),
      },
      insights: {
        attendanceRate,
        attendanceRateDelta: attendanceRate - prevRate,
        punctualityScore,
        punctualityDelta: punctualityScore - prevPunctuality,
        leaveBalance: annual
          ? {
              used: annual.usedDays,
              entitled: annual.entitledDays,
              remaining: annual.remainingDays,
              label: `${annual.usedDays} / ${annual.entitledDays} days`,
            }
          : null,
      },
      calendar,
      checkInOutTrend,
      history,
      recentActivity,
      leaveBalances: balance.data,
    };
  }

  async listAttendances(query: AttendanceListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const fromDate = query.date
      ? query.date.slice(0, 10)
      : query.fromDate?.slice(0, 10);
    const toDate = query.date
      ? query.date.slice(0, 10)
      : query.toDate?.slice(0, 10);

    const qb = this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.shift', 'shift')
      .orderBy('a.attendanceDate', 'DESC')
      .addOrderBy('user.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (query.employeeId) {
      qb.andWhere('a.employeeId = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (fromDate) qb.andWhere('a.attendanceDate >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('a.attendanceDate <= :toDate', { toDate });
    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }
    if (query.departmentId) {
      qb.andWhere('employee.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.roleId) {
      qb.andWhere('user.roleId = :roleId', { roleId: query.roleId });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR employee.designation ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((r) => this.attendancesService.toListItem(r)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async summaryForDate(
    focusDate: string,
    query: AttendanceDashboardQueryDto,
  ) {
    const qb = this.baseFilteredQb(query);
    qb.andWhere('a.attendanceDate = :focusDate', { focusDate });
    const rows = await qb.getMany();

    const present = rows.filter((r) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY, AttendanceStatus.INCOMPLETE].includes(
        r.status as AttendanceStatus,
      ),
    ).length;
    const absent = rows.filter((r) => r.status === AttendanceStatus.ABSENT).length;
    const late = rows.filter(
      (r) => r.status === AttendanceStatus.LATE || r.lateMinutes > 0,
    ).length;
    const onLeave = rows.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;

    const prevDate = addDays(focusDate, -1);
    const prevQb = this.baseFilteredQb(query);
    prevQb.andWhere('a.attendanceDate = :prevDate', { prevDate });
    const prev = await prevQb.getMany();
    const prevPresent = prev.filter((r) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
        r.status as AttendanceStatus,
      ),
    ).length;
    const prevAbsent = prev.filter((r) => r.status === AttendanceStatus.ABSENT).length;
    const prevLate = prev.filter(
      (r) => r.status === AttendanceStatus.LATE || r.lateMinutes > 0,
    ).length;
    const prevLeave = prev.filter(
      (r) => r.status === AttendanceStatus.ON_LEAVE,
    ).length;

    const pct = (cur: number, old: number) => {
      if (old === 0) return cur === 0 ? 0 : 100;
      return Math.round(((cur - old) / old) * 100);
    };

    return {
      presentToday: { value: present, changePercent: pct(present, prevPresent) },
      absentToday: { value: absent, changePercent: pct(absent, prevAbsent) },
      lateArrivals: { value: late, changePercent: pct(late, prevLate) },
      onLeave: { value: onLeave, changePercent: pct(onLeave, prevLeave) },
    };
  }

  private async weeklyTrend(
    anyDateInRange: string,
    query: AttendanceDashboardQueryDto,
  ) {
    const weekStart = startOfWeekMonday(anyDateInRange);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const qb = this.baseFilteredQb(query);
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', {
      from: days[0],
      to: days[6],
    });
    const rows = await qb.getMany();
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return days.map((date, i) => {
      const dayRows = rows.filter((r) => r.attendanceDate === date);
      const present = dayRows.filter((r) =>
        [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
          r.status as AttendanceStatus,
        ),
      ).length;
      const absent = dayRows.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      const total = present + absent;
      return {
        date,
        label: labels[i],
        present,
        absent,
        ratePercent: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }

  private async departmentBreakdown(
    focusDate: string,
    query: AttendanceDashboardQueryDto,
  ) {
    const qb = this.baseFilteredQb(query);
    qb.andWhere('a.attendanceDate = :focusDate', { focusDate });
    qb.andWhere('a.status IN (:...ok)', {
      ok: [
        AttendanceStatus.PRESENT,
        AttendanceStatus.LATE,
        AttendanceStatus.HALF_DAY,
        AttendanceStatus.INCOMPLETE,
      ],
    });
    // `employee` is already joined in baseFilteredQb — only add department.
    const rows = await qb
      .leftJoin('employee.department', 'department')
      .select('employee.departmentId', 'departmentId')
      .addSelect('department.name', 'name')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('employee.departmentId')
      .addGroupBy('department.name')
      .getRawMany();

    return rows
      .map((r) => ({
        departmentId: (r.departmentId as string | null) ?? null,
        name: (r.name as string | null) ?? 'Unassigned',
        count: Number(r.count) || 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private async monthlyHeatmap(
    focusDate: string,
    query: AttendanceDashboardQueryDto,
  ) {
    const year = Number(focusDate.slice(0, 4));
    const month = Number(focusDate.slice(5, 7));
    const { fromDate, toDate } = monthBounds(year, month);
    const qb = this.baseFilteredQb(query);
    qb.andWhere('a.attendanceDate BETWEEN :fromDate AND :toDate', {
      fromDate,
      toDate,
    });
    const rows = await qb.getMany();

    const byDate = new Map<string, Attendance[]>();
    for (const r of rows) {
      const list = byDate.get(r.attendanceDate) ?? [];
      list.push(r);
      byDate.set(r.attendanceDate, list);
    }

    const days: Array<{
      date: string;
      present: number;
      absent: number;
      ratePercent: number;
    }> = [];
    let cursor = fromDate;
    while (cursor <= toDate) {
      const list = byDate.get(cursor) ?? [];
      const present = list.filter((r) =>
        [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.HALF_DAY].includes(
          r.status as AttendanceStatus,
        ),
      ).length;
      const absent = list.filter(
        (r) => r.status === AttendanceStatus.ABSENT,
      ).length;
      const total = present + absent;
      days.push({
        date: cursor,
        present,
        absent,
        ratePercent: total > 0 ? Math.round((present / total) * 100) : 0,
      });
      cursor = addDays(cursor, 1);
    }

    return { year, month, fromDate, toDate, days };
  }

  private baseFilteredQb(query: AttendanceDashboardQueryDto) {
    const qb = this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoin('a.employee', 'employee')
      .leftJoin('employee.user', 'user');

    if (query.departmentId) {
      qb.andWhere('employee.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.roleId) {
      qb.andWhere('user.roleId = :roleId', { roleId: query.roleId });
    }
    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere('(user.name ILIKE :search OR user.code ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    return qb;
  }

  private resolveRange(query: {
    fromDate?: string;
    toDate?: string;
    preset?: string;
  }) {
    const today = new Date().toISOString().slice(0, 10);
    let fromDate = query.fromDate?.slice(0, 10);
    let toDate = query.toDate?.slice(0, 10);
    const preset = query.preset;

    if (!fromDate || !toDate) {
      if (preset === 'week') {
        fromDate = startOfWeekMonday(today);
        toDate = addDays(fromDate, 6);
      } else if (preset === 'month') {
        const y = Number(today.slice(0, 4));
        const m = Number(today.slice(5, 7));
        ({ fromDate, toDate } = monthBounds(y, m));
      } else {
        fromDate = today;
        toDate = today;
      }
    }

    if (!parseIsoDate(fromDate!) || !parseIsoDate(toDate!)) {
      fromDate = today;
      toDate = today;
    }

    return {
      fromDate: fromDate!,
      toDate: toDate!,
      focusDate: toDate!,
    };
  }
}
