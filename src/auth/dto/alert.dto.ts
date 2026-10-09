import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AlertStatus,
  AlertType,
} from '../../database/entities/alert.entity';
import { NotificationSeverity } from '../../database/entities/notification.entity';

export class AlertListQueryDto {
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
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;
}

export class ResolveAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class DismissAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

/** Re-export for consumers that import from dto only. */
export { AlertStatus, AlertType };
