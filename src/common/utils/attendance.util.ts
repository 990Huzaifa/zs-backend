import {
  AttendanceStatus,
  CalculationStatus,
} from '../../database/entities/hr/attendance.entity';

export interface ShiftPolicySnapshot {
  shift?: {
    id?: string;
    name?: string;
    startTime?: string;
    endTime?: string;
    requiredWorkMinutes?: number;
    graceMinutes?: number;
  };
  breakPolicy?: {
    id?: string;
    name?: string;
    allowedMinutes?: number;
    windowStart?: string;
    windowEnd?: string;
    allowMultipleBreaks?: boolean;
    paid?: boolean;
    excessDeductible?: boolean;
  };
}

export interface AttendanceCalcInput {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  requiredWorkMinutes: number;
  graceMinutes: number;
  allowedBreakMinutes: number;
  breakPaid: boolean;
  excessDeductible: boolean;
  firstCheckIn: Date | null;
  lastCheckOut: Date | null;
  breakMinutes: number;
}

export interface AttendanceCalcResult {
  workedMinutes: number;
  allowedBreakMinutes: number;
  excessBreakMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  shortfallMinutes: number;
  overtimeMinutes: number;
  provisionalDeductionMinutes: number;
  status: AttendanceStatus;
  calculationStatus: CalculationStatus;
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

export function formatDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.floor(totalMinutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Core attendance math from schedule + punches + break usage.
 */
export function calculateAttendanceMetrics(
  input: AttendanceCalcInput,
): AttendanceCalcResult {
  const allowedBreakMinutes = Math.max(0, input.allowedBreakMinutes || 0);
  const breakMinutes = Math.max(0, Math.floor(input.breakMinutes || 0));
  const excessBreakMinutes = Math.max(0, breakMinutes - allowedBreakMinutes);

  if (!input.firstCheckIn) {
    return {
      workedMinutes: 0,
      allowedBreakMinutes,
      excessBreakMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      shortfallMinutes: Math.max(0, input.requiredWorkMinutes || 0),
      overtimeMinutes: 0,
      provisionalDeductionMinutes: Math.max(0, input.requiredWorkMinutes || 0),
      status: AttendanceStatus.ABSENT,
      calculationStatus: CalculationStatus.CALCULATED,
    };
  }

  const lateRaw = minutesBetween(input.scheduledStartAt, input.firstCheckIn);
  const lateMinutes = Math.max(0, lateRaw - Math.max(0, input.graceMinutes || 0));

  let earlyLeaveMinutes = 0;
  let spanMinutes = 0;
  if (input.lastCheckOut) {
    earlyLeaveMinutes = minutesBetween(
      input.lastCheckOut,
      input.scheduledEndAt,
    );
    spanMinutes = minutesBetween(input.firstCheckIn, input.lastCheckOut);
  }

  // Unpaid break reduces worked time; paid break does not (unless excess deductible).
  let workedMinutes = spanMinutes;
  if (!input.breakPaid) {
    workedMinutes = Math.max(0, spanMinutes - breakMinutes);
  } else if (input.excessDeductible) {
    workedMinutes = Math.max(0, spanMinutes - excessBreakMinutes);
  }

  const required = Math.max(0, input.requiredWorkMinutes || 0);
  const shortfallMinutes = Math.max(0, required - workedMinutes);
  const overtimeMinutes = Math.max(0, workedMinutes - required);

  let status: AttendanceStatus;
  if (!input.lastCheckOut) {
    status = AttendanceStatus.INCOMPLETE;
  } else if (workedMinutes <= 0) {
    status = AttendanceStatus.ABSENT;
  } else if (required > 0 && workedMinutes < required * 0.5) {
    status = AttendanceStatus.HALF_DAY;
  } else if (lateMinutes > 0) {
    status = AttendanceStatus.LATE;
  } else {
    status = AttendanceStatus.PRESENT;
  }

  const provisionalDeductionMinutes =
    shortfallMinutes +
    (input.excessDeductible && !input.breakPaid ? 0 : 0) +
    (input.excessDeductible && input.breakPaid ? 0 : 0);

  return {
    workedMinutes,
    allowedBreakMinutes,
    excessBreakMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    shortfallMinutes,
    overtimeMinutes,
    provisionalDeductionMinutes: shortfallMinutes,
    status,
    calculationStatus:
      input.lastCheckOut != null
        ? CalculationStatus.CALCULATED
        : CalculationStatus.PROVISIONAL,
  };
}

export function readPolicySnapshot(snapshot: Record<string, unknown> | null | undefined): {
  requiredWorkMinutes: number;
  graceMinutes: number;
  allowedBreakMinutes: number;
  breakPaid: boolean;
  excessDeductible: boolean;
  shiftName: string | null;
} {
  const policy = (snapshot ?? {}) as ShiftPolicySnapshot;
  return {
    requiredWorkMinutes: Number(policy.shift?.requiredWorkMinutes ?? 480),
    graceMinutes: Number(policy.shift?.graceMinutes ?? 0),
    allowedBreakMinutes: Number(policy.breakPolicy?.allowedMinutes ?? 0),
    breakPaid: policy.breakPolicy?.paid !== false,
    excessDeductible: policy.breakPolicy?.excessDeductible !== false,
    shiftName: policy.shift?.name ?? null,
  };
}

export function combineDateAndTime(workDate: string, time: string): Date {
  const parts = time.trim().split(':');
  const normalized =
    parts.length === 2 ? `${parts[0]}:${parts[1]}:00` : time.trim().slice(0, 8);
  return new Date(`${workDate}T${normalized}.000Z`);
}

export function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

export function startOfWeekMonday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(year: number, month1to12: number): {
  fromDate: string;
  toDate: string;
} {
  const fromDate = `${year}-${String(month1to12).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month1to12, 0));
  const toDate = last.toISOString().slice(0, 10);
  return { fromDate, toDate };
}
