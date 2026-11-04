import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryChallanStatus } from '../../database/entities/warehousing/delivery-challan.entity';

export class CreateDeliveryChallanItemDto {
  @IsUUID()
  inventoryId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  noOfCartons: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noOfPairs?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class CreateDeliveryChallanDto {
  @IsOptional()
  @IsDateString()
  challanDateTime?: string;

  @IsUUID()
  primaryInventoryId: string;

  @IsUUID()
  shopId: string;

  @IsUUID()
  driverId: string;

  @IsUUID()
  vehicleId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryChallanItemDto)
  items: CreateDeliveryChallanItemDto[];
}

export class UpdateDeliveryChallanDto {
  @IsOptional()
  @IsDateString()
  challanDateTime?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryChallanItemDto)
  items?: CreateDeliveryChallanItemDto[];
}

export class DeliveryChallanListQueryDto {
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

  /** Match challanNo, shop name/code, driver phone, vehicle plate */
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsEnum(DeliveryChallanStatus)
  status?: DeliveryChallanStatus;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  primaryInventoryId?: string;

  /** Filter by challanDateTime from YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Filter by challanDateTime to YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Month filter for challanDateTime.
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
