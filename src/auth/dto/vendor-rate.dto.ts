import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RateStatus } from '../../database/entities/vendor.entity';

/** Single rate row (vendorId comes from parent create/bulk payload). */
export class CreateVendorRateItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MinLength(1)
  locationName?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsDateString()
  effectiveFromDate: string;

  @IsOptional()
  @IsEnum(RateStatus)
  status?: RateStatus;
}

export class CreateVendorRateDto extends CreateVendorRateItemDto {
  @IsUUID()
  vendorId: string;
}

/** Bulk create — one vendor, many rate rows (all-or-nothing). */
export class BulkCreateVendorRateDto {
  @IsUUID()
  vendorId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateVendorRateItemDto)
  rates: CreateVendorRateItemDto[];
}

export class UpdateVendorRateDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MinLength(1)
  locationName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsDateString()
  effectiveFromDate?: string;
}

/** Single row for bulk edit — `id` required. */
export class BulkUpdateVendorRateItemDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MinLength(1)
  locationName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsDateString()
  effectiveFromDate?: string;
}

/** Bulk edit — one vendor, many existing rate rows (all-or-nothing). */
export class BulkUpdateVendorRateDto {
  @IsUUID()
  vendorId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateVendorRateItemDto)
  rates: BulkUpdateVendorRateItemDto[];
}

export class ChangeVendorRateStatusDto {
  @IsEnum(RateStatus)
  status: RateStatus;
}

export class VendorRateListQueryDto {
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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(RateStatus)
  status?: RateStatus;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
