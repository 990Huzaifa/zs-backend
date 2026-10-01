import {
  AttendanceStatus as DayAttendanceStatus,
} from '../../database/entities/hr/attendance.entity';
import {
  PayType,
  type EmployeeSalary,
} from '../../database/entities/hr/payroll.entity';

export type Money = number;

export interface AttendanceDayRow {
  status: string;
  workedMinutes?: number | null;
  lateMinutes?: number | null;
  shortfallMinutes?: number | null;
  overtimeMinutes?: number | null;
  leaveType?: string | null;
}

export interface AttendancePeriodSummary {
  presentDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  holidayDays: number;
  workedMinutes: number;
  lateMinutes: number;
  shortfallMinutes: number;
  overtimeMinutes: number;
}

export interface PayslipEarningsInput {
  basicSalary: Money;
  houseAllowance: Money;
  transportAllowance: Money;
  mobileAllowance: Money;
  mealAllowance: Money;
  otherAllowance: Money;
  overtimeMinutes: number;
  overtimeRatePerHour: Money | null;
}

export interface PayslipCalculationInput extends PayslipEarningsInput {
  payType: PayType;
  attendance: AttendancePeriodSummary;
  /** Calendar / working days in the pay period (used for monthly proration). */
  periodDays: number;
  otherDeductionAmount?: Money;
}

export interface PayslipCalculationResult {
  basicSalary: Money;
  houseAllowance: Money;
  transportAllowance: Money;
  mobileAllowance: Money;
  mealAllowance: Money;
  otherAllowance: Money;
  overtimeMinutes: number;
  overtimeAmount: Money;
  presentDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  holidayDays: number;
  workedMinutes: number;
  lateMinutes: number;
  shortfallMinutes: number;
  attendanceDeductionAmount: Money;
  otherDeductionAmount: Money;
  grossAmount: Money;
  totalDeductions: Money;
  netAmount: Money;
}

/** Round to 2 decimal places (money). */
export function toMoney(value: number | string | null | undefined): Money {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumAllowances(salary: {
  houseAllowance?: number | string | null;
  transportAllowance?: number | string | null;
  mobileAllowance?: number | string | null;
  mealAllowance?: number | string | null;
  otherAllowance?: number | string | null;
}): Money {
  return toMoney(
    toMoney(salary.houseAllowance) +
      toMoney(salary.transportAllowance) +
      toMoney(salary.mobileAllowance) +
      toMoney(salary.mealAllowance) +
      toMoney(salary.otherAllowance),
  );
}

export function computeOvertimeAmount(
  overtimeMinutes: number,
  overtimeRatePerHour: Money | null | undefined,
): Money {
  const minutes = Math.max(0, Math.floor(overtimeMinutes || 0));
  const rate = toMoney(overtimeRatePerHour);
  if (minutes <= 0 || rate <= 0) return 0;
  return toMoney((minutes / 60) * rate);
}

/**
 * Inclusive calendar-day count between ISO date strings (YYYY-MM-DD).
 */
export function countInclusiveDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when `asOf` (YYYY-MM-DD) falls within salary effective window.
 */
export function isSalaryEffectiveOn(
  salary: Pick<EmployeeSalary, 'effectiveFrom' | 'effectiveTo' | 'isActive'>,
  asOf: string,
  requireActive = true,
): boolean {
  if (requireActive && !salary.isActive) return false;
  if (salary.effectiveFrom > asOf) return false;
  if (salary.effectiveTo && salary.effectiveTo < asOf) return false;
  return true;
}

export function emptyAttendanceSummary(): AttendancePeriodSummary {
  return {
    presentDays: 0,
    absentDays: 0,
    unpaidLeaveDays: 0,
    paidLeaveDays: 0,
    holidayDays: 0,
    workedMinutes: 0,
    lateMinutes: 0,
    shortfallMinutes: 0,
    overtimeMinutes: 0,
  };
}

/**
 * Aggregate daily attendance rows into payslip summary fields.
 */
export function summarizeAttendance(
  rows: AttendanceDayRow[],
): AttendancePeriodSummary {
  const summary = emptyAttendanceSummary();

  for (const row of rows) {
    summary.workedMinutes += Math.max(0, Math.floor(row.workedMinutes ?? 0));
    summary.lateMinutes += Math.max(0, Math.floor(row.lateMinutes ?? 0));
    summary.shortfallMinutes += Math.max(
      0,
      Math.floor(row.shortfallMinutes ?? 0),
    );
    summary.overtimeMinutes += Math.max(
      0,
      Math.floor(row.overtimeMinutes ?? 0),
    );

    switch (normalizeAttendanceStatus(row.status)) {
      case DayAttendanceStatus.PRESENT:
      case DayAttendanceStatus.LATE:
      case DayAttendanceStatus.HALF_DAY:
      case DayAttendanceStatus.INCOMPLETE:
        summary.presentDays += 1;
        break;
      case DayAttendanceStatus.ABSENT:
        summary.absentDays += 1;
        break;
      case DayAttendanceStatus.ON_LEAVE:
        if (String(row.leaveType ?? '').toUpperCase() === 'UNPAID') {
          summary.unpaidLeaveDays += 1;
        } else {
          summary.paidLeaveDays += 1;
        }
        break;
      case DayAttendanceStatus.HOLIDAY:
        summary.holidayDays += 1;
        break;
      case DayAttendanceStatus.WEEKLY_OFF:
        break;
      default:
        if ((row.workedMinutes ?? 0) > 0) {
          summary.presentDays += 1;
        } else {
          summary.absentDays += 1;
        }
        break;
    }
  }

  return summary;
}

function normalizeAttendanceStatus(status: string): string {
  return String(status ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Core payslip math from salary snapshot + attendance summary.
 */
export function calculatePayslipAmounts(
  input: PayslipCalculationInput,
): PayslipCalculationResult {
  const periodDays = Math.max(1, Math.floor(input.periodDays || 1));
  const attendance = input.attendance ?? emptyAttendanceSummary();
  const overtimeMinutes = Math.max(
    0,
    Math.floor(input.overtimeMinutes || attendance.overtimeMinutes || 0),
  );
  const overtimeAmount = computeOvertimeAmount(
    overtimeMinutes,
    input.overtimeRatePerHour,
  );

  const baseBasic = toMoney(input.basicSalary);
  const houseAllowance = toMoney(input.houseAllowance);
  const transportAllowance = toMoney(input.transportAllowance);
  const mobileAllowance = toMoney(input.mobileAllowance);
  const mealAllowance = toMoney(input.mealAllowance);
  const otherAllowance = toMoney(input.otherAllowance);
  const allowances =
    houseAllowance +
    transportAllowance +
    mobileAllowance +
    mealAllowance +
    otherAllowance;

  let basicSalary = baseBasic;
  let attendanceDeductionAmount = 0;

  if (input.payType === PayType.DAILY) {
    const paidDays =
      attendance.presentDays +
      attendance.paidLeaveDays +
      attendance.holidayDays;
    basicSalary = toMoney(baseBasic * paidDays);
    attendanceDeductionAmount = toMoney(
      shortfallDeduction(baseBasic, attendance.shortfallMinutes, 1),
    );
  } else if (input.payType === PayType.HOURLY) {
    const hours = attendance.workedMinutes / 60;
    basicSalary = toMoney(baseBasic * hours);
    attendanceDeductionAmount = 0;
  } else {
    // MONTHLY — full package; deduct absences / unpaid leave / shortfall.
    const unpaidDays = attendance.absentDays + attendance.unpaidLeaveDays;
    const dailyRate = baseBasic / periodDays;
    const absenceDeduction = toMoney(dailyRate * unpaidDays);
    const shortfall = shortfallDeduction(
      baseBasic,
      attendance.shortfallMinutes,
      periodDays,
    );
    attendanceDeductionAmount = toMoney(absenceDeduction + shortfall);
  }

  const otherDeductionAmount = toMoney(input.otherDeductionAmount);
  const grossAmount = toMoney(basicSalary + allowances + overtimeAmount);
  const totalDeductions = toMoney(
    attendanceDeductionAmount + otherDeductionAmount,
  );
  const netAmount = toMoney(Math.max(0, grossAmount - totalDeductions));

  return {
    basicSalary,
    houseAllowance,
    transportAllowance,
    mobileAllowance,
    mealAllowance,
    otherAllowance,
    overtimeMinutes,
    overtimeAmount,
    presentDays: attendance.presentDays,
    absentDays: attendance.absentDays,
    unpaidLeaveDays: attendance.unpaidLeaveDays,
    paidLeaveDays: attendance.paidLeaveDays,
    holidayDays: attendance.holidayDays,
    workedMinutes: attendance.workedMinutes,
    lateMinutes: attendance.lateMinutes,
    shortfallMinutes: attendance.shortfallMinutes,
    attendanceDeductionAmount,
    otherDeductionAmount,
    grossAmount,
    totalDeductions,
    netAmount,
  };
}

/** Shortfall minutes valued at daily-rate / 8h (480 minutes). */
function shortfallDeduction(
  basicForPeriodUnit: Money,
  shortfallMinutes: number,
  periodDays: number,
): Money {
  const minutes = Math.max(0, Math.floor(shortfallMinutes || 0));
  if (minutes <= 0 || basicForPeriodUnit <= 0) return 0;
  const dailyRate = basicForPeriodUnit / Math.max(1, periodDays);
  const perMinute = dailyRate / 480;
  return toMoney(perMinute * minutes);
}

export function salarySnapshotFromEntity(salary: EmployeeSalary): {
  basicSalary: Money;
  houseAllowance: Money;
  transportAllowance: Money;
  mobileAllowance: Money;
  mealAllowance: Money;
  otherAllowance: Money;
  overtimeRatePerHour: Money | null;
  payType: PayType;
} {
  return {
    basicSalary: toMoney(salary.basicSalary),
    houseAllowance: toMoney(salary.houseAllowance),
    transportAllowance: toMoney(salary.transportAllowance),
    mobileAllowance: toMoney(salary.mobileAllowance),
    mealAllowance: toMoney(salary.mealAllowance),
    otherAllowance: toMoney(salary.otherAllowance),
    overtimeRatePerHour:
      salary.overtimeRatePerHour == null
        ? null
        : toMoney(salary.overtimeRatePerHour),
    payType: salary.payType,
  };
}
