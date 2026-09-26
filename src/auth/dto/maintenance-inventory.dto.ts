import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  MaintenanceBatchStatus,
  MaintenanceStockMovementType,
  MaintenanceStockReferenceType,
} from '../../database/entities/maintenance/maintenance-inventory.entity';

export class MaintenanceStockListQueryDto {
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
  productId?: string;

  /** Only rows with availableQuantity > 0 */
  @IsOptional()
  @Type(() => Boolean)
  inStockOnly?: boolean;
}

export class MaintenanceBatchListQueryDto {
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
  productId?: string;

  @IsOptional()
  @IsEnum(MaintenanceBatchStatus)
  status?: MaintenanceBatchStatus;

  @IsOptional()
  @IsUUID()
  grnId?: string;
}

export class MaintenanceStockLogListQueryDto {
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
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsUUID()
  grnId?: string;

  @IsOptional()
  @IsUUID()
  jobCardId?: string;

  @IsOptional()
  @IsEnum(MaintenanceStockMovementType)
  movementType?: MaintenanceStockMovementType;

  @IsOptional()
  @IsEnum(MaintenanceStockReferenceType)
  referenceType?: MaintenanceStockReferenceType;
}

export class AdjustMaintenanceStockDto {
  @IsUUID()
  productId: string;

  /** Optional: adjust a specific batch. Required for adjustment_out prefer. */
  @IsOptional()
  @IsUUID()
  batchId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsIn([
    MaintenanceStockMovementType.ADJUSTMENT_IN,
    MaintenanceStockMovementType.ADJUSTMENT_OUT,
  ])
  movementType:
    | MaintenanceStockMovementType.ADJUSTMENT_IN
    | MaintenanceStockMovementType.ADJUSTMENT_OUT;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number | null;

  @IsOptional()
  @IsDateString()
  manufacturingDate?: string | null;

  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  remarks?: string | null;
}

export class ChangeBatchStatusDto {
  @IsEnum(MaintenanceBatchStatus)
  status: MaintenanceBatchStatus;
}
