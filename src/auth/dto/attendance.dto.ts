import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AttendanceSource,
  AttendanceStatus,
  CheckOutReason,
} from '../../database/entities/hr/attendance.entity';
import {
  LeaveDurationType,
  LeaveType,
} from '../../database/entities/hr/leave.entity';

const TIME_OR_ISO =
  /^(\d{4}-\d{2}-\d{2}T.*|[01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class AttendanceListQueryDto {
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

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class AttendanceDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  /** Convenience: today | week | month */
  @IsOptional()
  @IsString()
  preset?: 'today' | 'week' | 'month';

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsString()
  search?: string;

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
}

export class EmployeeAttendanceDetailQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  preset?: 'today' | 'week' | 'month';
}

export class ManualAttendanceDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  attendanceDate: string;

  /** Optional override; defaults to the employee's current shiftId. */
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  /** ISO timestamptz or HH:mm / HH:mm:ss (combined with attendanceDate) */
  @IsString()
  @Matches(TIME_OR_ISO, { message: 'checkInAt must be ISO or HH:mm' })
  checkInAt: string;

  @IsString()
  @Matches(TIME_OR_ISO, { message: 'checkOutAt must be ISO or HH:mm' })
  checkOutAt: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO, { message: 'breakOutAt must be ISO or HH:mm' })
  breakOutAt?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO, { message: 'breakInAt must be ISO or HH:mm' })
  breakInAt?: string;

  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  notifyEmployee?: boolean;
}

export class PunchAttendanceDto {
  /** Admin punch for another employee; mobile omits and uses current user's employee. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  attendanceDate?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO)
  occurredAt?: string;

  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workLocation?: string;

  @IsOptional()
  @IsEnum(CheckOutReason)
  reason?: CheckOutReason;
}

export class AdjustAttendanceDto {
  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO)
  checkInAt?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO)
  checkOutAt?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO)
  breakOutAt?: string | null;

  @IsOptional()
  @IsString()
  @Matches(TIME_OR_ISO)
  breakInAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workLocation?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsBoolean()
  notifyEmployee?: boolean;
}

export class MarkLeaveDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsOptional()
  @IsEnum(LeaveDurationType)
  durationType?: LeaveDurationType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;

  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @IsOptional()
  @IsBoolean()
  notifyEmployee?: boolean;
}

export class UpsertLeaveBalanceDto {
  @IsUUID()
  employeeId: string;

  @Type(() => Number)
  @IsInt()
  year: number;

  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @Type(() => Number)
  @Min(0)
  entitledDays: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  usedDays?: number;
}
