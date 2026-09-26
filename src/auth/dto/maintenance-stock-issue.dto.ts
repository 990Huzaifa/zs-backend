import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaintenanceStockIssueStatus } from '../../database/entities/maintenance/maintenance-stock-issue.entity';

export class CreateMaintenanceStockIssueItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  batchId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class CreateMaintenanceStockIssueDto {
  @IsUUID()
  jobCardId: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsUUID()
  issuedById?: string | null;

  @IsOptional()
  @IsEnum(MaintenanceStockIssueStatus)
  status?:
    | MaintenanceStockIssueStatus.DRAFT
    | MaintenanceStockIssueStatus.PENDING_APPROVAL;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaintenanceStockIssueItemDto)
  items: CreateMaintenanceStockIssueItemDto[];
}

export class UpdateMaintenanceStockIssueDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsUUID()
  issuedById?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ChangeMaintenanceStockIssueStatusDto {
  @IsEnum(MaintenanceStockIssueStatus)
  status: MaintenanceStockIssueStatus;
}

export class UpdateMaintenanceStockIssueItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ReplaceMaintenanceStockIssueItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaintenanceStockIssueItemDto)
  items: CreateMaintenanceStockIssueItemDto[];
}

export class MaintenanceStockIssueListQueryDto {
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
  @IsEnum(MaintenanceStockIssueStatus)
  status?: MaintenanceStockIssueStatus;

  @IsOptional()
  @IsUUID()
  jobCardId?: string;
}
