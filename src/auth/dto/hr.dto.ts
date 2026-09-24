import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

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
