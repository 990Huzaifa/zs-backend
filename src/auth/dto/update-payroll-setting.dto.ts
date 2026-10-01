import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PayrollAutomationMode } from '../../database/entities/system-setting.entity';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdatePayrollSettingDto {
  @IsOptional()
  @IsEnum(PayrollAutomationMode)
  mode?: PayrollAutomationMode;

  /** 1–28 (avoids Feb / short-month edge cases). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  autoDayOfMonth?: number;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'autoTime must be HH:mm (24h)' })
  autoTime?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoCalculate?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @IsOptional()
  @IsBoolean()
  autoMarkPaid?: boolean;
}
