import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  ActivityAction,
  ActivityModule,
  ActivityUserType,
} from '../../database/entities/activity.entity';

export class ActivityListQueryDto {
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

  /** Search across user name, details, and record ref */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ActivityModule)
  module?: ActivityModule;

  @IsOptional()
  @IsEnum(ActivityAction)
  action?: ActivityAction;

  @IsOptional()
  @IsEnum(ActivityUserType)
  userType?: ActivityUserType;

  /** Single calendar day filter (YYYY-MM-DD). Ignored if startDate/endDate set. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
