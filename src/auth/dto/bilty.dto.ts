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

export class BiltyStopContactDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @MinLength(1)
  address: string;
}

export class CreateBiltyLoadingDto {
  @IsUUID()
  clientId: string;

  @IsDateString()
  loadingDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingArrivalDateTime?: string | null;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BiltyStopContactDto)
  stopsContact?: BiltyStopContactDto[] | null;
}

export class CreateBiltyOffLoadingDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  offLoadingDateTime?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  offLoadingArrivalDateTime?: string | null;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BiltyStopContactDto)
  stopsContact?: BiltyStopContactDto[] | null;
}

export class CreateBiltyDto {
  @IsDateString()
  issueDate: string;

  @IsUUID()
  driverId: string;

  /** DB vehicle — provide this or `vehicleRegistrationNumber`. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  vehicleId?: string | null;

  /** Free-text plate when vehicle is not in the fleet DB. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  vehicleRegistrationNumber?: string | null;

  @IsString()
  @MinLength(1)
  description: string;

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
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  vehicleId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  vehicleRegistrationNumber?: string | null;

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
