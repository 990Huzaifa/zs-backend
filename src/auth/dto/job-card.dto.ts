import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  JobCardFindingStatus,
  JobCardPriority,
  JobCardStatus,
  MaintenanceType,
} from '../../database/entities/maintenance/jobcard.entity';

export class CreateJobCardItemDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(JobCardFindingStatus)
  status?: JobCardFindingStatus;

  @IsOptional()
  @IsUUID()
  assignedById?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  findingImage?: string[] | null;

  @IsOptional()
  @IsDateString()
  completedAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  odometerReading?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  attachment?: string[] | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  workshopLocation?: string | null;

  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}

export class CreateJobCardDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  odometerReading: number;

  @IsString()
  @MinLength(1)
  jobCardTitle: string;

  @IsEnum(MaintenanceType)
  maintenanceType: MaintenanceType;

  @IsOptional()
  @IsEnum(JobCardPriority)
  priority?: JobCardPriority;

  /** Default draft. Allow open on create. */
  @IsOptional()
  @IsEnum(JobCardStatus)
  status?: JobCardStatus.DRAFT | JobCardStatus.OPEN;

  @IsOptional()
  @IsUUID()
  raisedById?: string | null;

  @IsOptional()
  @IsUUID()
  maintenanceScheduleId?: string | null;

  @IsOptional()
  @IsDateString()
  raiseDate?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string | null;

  @IsOptional()
  @IsString()
  siteLocation?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobCardItemDto)
  items?: CreateJobCardItemDto[];
}

export class UpdateJobCardDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  odometerReading?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  jobCardTitle?: string;

  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @IsOptional()
  @IsEnum(JobCardPriority)
  priority?: JobCardPriority;

  @IsOptional()
  @IsUUID()
  raisedById?: string | null;

  @IsOptional()
  @IsUUID()
  maintenanceScheduleId?: string | null;

  @IsOptional()
  @IsDateString()
  raiseDate?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string | null;

  @IsOptional()
  @IsString()
  siteLocation?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ChangeJobCardStatusDto {
  @IsEnum(JobCardStatus)
  status: JobCardStatus;

  @IsOptional()
  @IsString()
  cancellationReason?: string | null;
}

export class UpdateJobCardItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  assignedById?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  findingImage?: string[] | null;

  @IsOptional()
  @IsDateString()
  completedAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  odometerReading?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  attachment?: string[] | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  workshopLocation?: string | null;

  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}

export class ChangeJobCardItemStatusDto {
  @IsEnum(JobCardFindingStatus)
  status: JobCardFindingStatus;

  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}

export class ReplaceJobCardItemsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => CreateJobCardItemDto)
  items: CreateJobCardItemDto[];
}

export class JobCardListQueryDto {
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
  @IsEnum(JobCardStatus)
  status?: JobCardStatus;

  @IsOptional()
  @IsEnum(JobCardPriority)
  priority?: JobCardPriority;

  @IsOptional()
  @IsEnum(MaintenanceType)
  maintenanceType?: MaintenanceType;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  raisedById?: string;

  @IsOptional()
  @IsUUID()
  maintenanceScheduleId?: string;
}

export class RemoveJobCardFindingImageDto {
  @IsString()
  @MinLength(1)
  key: string;
}

export class RemoveJobCardAttachmentDto {
  @IsString()
  @MinLength(1)
  key: string;
}
