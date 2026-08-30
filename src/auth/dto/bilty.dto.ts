import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BiltyStatus } from '../../database/entities/bilty.entity';

export class CreateBiltyLoadingDto {
  @IsUUID()
  clientId: string;

  @IsDateString()
  loadingDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  arrivalDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingTimeIn?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingTimeOut?: string | null;

  @IsUUID()
  pickupLocationId: string;

  @IsOptional()
  @IsString()
  loadingContactName?: string | null;

  @IsOptional()
  @IsString()
  loadingContactPhone?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noOfLoadingStops?: number | null;
}

export class CreateBiltyOffLoadingDto {
  @IsUUID()
  clientId: string;

  @IsDateString()
  offLoadingDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  offLoadingTimeIn?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  offLoadingTimeOut?: string | null;

  @IsUUID()
  dropoffLocationId: string;

  @IsOptional()
  @IsString()
  offLoadingContactName?: string | null;

  @IsOptional()
  @IsString()
  offLoadingContactPhone?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noOfOffLoadingStops?: number | null;
}

export class CreateBiltyDto {
  @IsDateString()
  issueDate: string;

  @IsUUID()
  driverId: string;

  @IsUUID()
  vehicleId: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsOptional()
  @IsString()
  refNumber?: string | null;

  @IsOptional()
  @IsString()
  totalWeight?: string | null;

  @IsOptional()
  @IsString()
  noOfPackages?: string | null;

  @IsOptional()
  @IsString()
  transaportorName?: string | null;

  @IsOptional()
  @IsString()
  transaportorPhone?: string | null;

  @IsOptional()
  @IsEnum(BiltyStatus)
  status?: BiltyStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBiltyLoadingDto)
  loadings?: CreateBiltyLoadingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBiltyOffLoadingDto)
  offLoadings?: CreateBiltyOffLoadingDto[];
}

export class UpdateBiltyDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsString()
  refNumber?: string | null;

  @IsOptional()
  @IsString()
  totalWeight?: string | null;

  @IsOptional()
  @IsString()
  noOfPackages?: string | null;

  @IsOptional()
  @IsString()
  transaportorName?: string | null;

  @IsOptional()
  @IsString()
  transaportorPhone?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBiltyLoadingDto)
  loadings?: CreateBiltyLoadingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBiltyOffLoadingDto)
  offLoadings?: CreateBiltyOffLoadingDto[];
}

export class ChangeBiltyStatusDto {
  @IsEnum(BiltyStatus)
  status: BiltyStatus;
}

export class BiltyListQueryDto {
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
  @IsEnum(BiltyStatus)
  status?: BiltyStatus;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
