import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePrimaryInventoryDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  biltyId: string;
}

export class UpdatePrimaryInventoryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

/**
 * Updates linked bilty.deliveryChallanNumber (UI gate pass).
 * Not stored on primary_inventory anymore.
 */
export class UpdatePrimaryGatePassDto {
  @IsString()
  @MinLength(1)
  gatePassNumber: string;
}

export class PrimaryInventoryListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  /** Match bilty code, delivery challan / gate pass, vehicle reg / free-text plate. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  biltyId?: string;

  /** Filter by bilty issue date (dispatch) from YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Filter by bilty issue date (dispatch) to YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Month filter for dispatch date (bilty.issueDate).
   * `1`–`12`, or omit for all months.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  /** Year for `month` filter. Defaults to current year when month is set. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;
}
