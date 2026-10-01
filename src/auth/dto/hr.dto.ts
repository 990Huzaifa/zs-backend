import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EmploymentType,
  Gender,
  MaritalStatus,
  Qualification,
} from '../../database/entities/hr/employee.entity';
import {
  PayPeriodStatus,
  PayrollRunStatus,
  PayslipStatus,
  PayType,
} from '../../database/entities/hr/payroll.entity';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class HrListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}

// ── Department ──────────────────────────────────────────────

export class CreateDepartmentDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

// ── Break Policy ────────────────────────────────────────────

export class CreateBreakPolicyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  allowedMinutes: number;

  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'windowStart must be HH:mm or HH:mm:ss',
  })
  windowStart: string;

  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'windowEnd must be HH:mm or HH:mm:ss',
  })
  windowEnd: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleBreaks?: boolean;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsBoolean()
  excessDeductible?: boolean;
}

export class UpdateBreakPolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allowedMinutes?: number;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'windowStart must be HH:mm or HH:mm:ss',
  })
  windowStart?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'windowEnd must be HH:mm or HH:mm:ss',
  })
  windowEnd?: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleBreaks?: boolean;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsBoolean()
  excessDeductible?: boolean;
}

// ── Shift ───────────────────────────────────────────────────

export class CreateShiftDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'startTime must be HH:mm or HH:mm:ss',
  })
  startTime: string;

  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'endTime must be HH:mm or HH:mm:ss',
  })
  endTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredWorkMinutes: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;

  @IsUUID()
  breakPolicyId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'startTime must be HH:mm or HH:mm:ss',
  })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'endTime must be HH:mm or HH:mm:ss',
  })
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredWorkMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;

  @IsOptional()
  @IsUUID()
  breakPolicyId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ShiftListQueryDto extends HrListQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  breakPolicyId?: string;
}

// ── Shift Assignment (employee ↔ shift for a work date) ─────

export class CreateShiftAssignmentDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  shiftId: string;

  @IsDateString()
  workDate: string;
}

export class BulkCreateShiftAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  employeeIds: string[];

  @IsUUID()
  shiftId: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  /** When true, existing employee+date rows are left unchanged. */
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class UpdateShiftAssignmentDto {
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsDateString()
  workDate?: string;
}

export class ShiftAssignmentListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

// ── Employee ────────────────────────────────────────────────

export class CreateEmployeeDto {
  /**
   * Case A: register existing user as employee.
   * When set, `name` / `email` / `password` / `roleId` are ignored for user creation.
   */
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  /** Case B: create new user + employee. Required when `userId` is omitted. */
  @ValidateIf((o: CreateEmployeeDto) => !o.userId)
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string | null;

  @IsOptional()
  @IsUUID()
  roleId?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsEnum(Qualification)
  qualification?: Qualification | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsBoolean()
  attendanceEnabled?: boolean;

  /**
   * Employee joining date (always stored on `employees`).
   * If create-new + DRIVER role, the same value is also written to `drivers.joiningDate`.
   */
  @IsOptional()
  @IsDateString()
  joiningDate?: string | null;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string | null;

  @IsOptional()
  @IsUUID()
  roleId?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsEnum(Qualification)
  qualification?: Qualification | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsBoolean()
  attendanceEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  joiningDate?: string | null;
}

export class EmployeeListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  attendanceEnabled?: boolean;
}

// ── Employee Salary ─────────────────────────────────────────

export class CreateEmployeeSalaryDto {
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsEnum(PayType)
  payType?: PayType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basicSalary: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  houseAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mobileAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mealAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtimeRatePerHour?: number | null;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmployeeSalaryDto {
  @IsOptional()
  @IsEnum(PayType)
  payType?: PayType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  houseAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mobileAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mealAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherAllowance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtimeRatePerHour?: number | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EmployeeSalaryListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(PayType)
  payType?: PayType;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  /** When set with employeeId, returns salary effective on this date. */
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

// ── Pay Period ──────────────────────────────────────────────

export class CreatePayPeriodDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsEnum(PayPeriodStatus)
  status?: PayPeriodStatus;
}

export class UpdatePayPeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(PayPeriodStatus)
  status?: PayPeriodStatus;
}

export class PayPeriodListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsEnum(PayPeriodStatus)
  status?: PayPeriodStatus;
}

// ── Payroll Run ─────────────────────────────────────────────

export class CreatePayrollRunDto {
  @IsUUID()
  payPeriodId: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /**
   * Optional employee filter. When omitted, all attendance-enabled employees
   * with an active salary are included at calculation time.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];
}

export class UpdatePayrollRunDto {
  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class PayrollRunListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsUUID()
  payPeriodId?: string;

  @IsOptional()
  @IsEnum(PayrollRunStatus)
  status?: PayrollRunStatus;
}

export class CalculatePayrollRunDto {
  /**
   * Optional subset of employees to (re)calculate.
   * When omitted, all eligible employees in scope are calculated.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];
}

// ── Payslip ─────────────────────────────────────────────────

export class PayslipListQueryDto extends HrListQueryDto {
  @IsOptional()
  @IsUUID()
  payrollRunId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(PayslipStatus)
  status?: PayslipStatus;
}

export class UpdatePayslipDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherDeductionAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  overtimeMinutes?: number;
}
