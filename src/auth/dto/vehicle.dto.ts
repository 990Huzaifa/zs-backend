import { Type } from 'class-transformer';
import {
  ArrayUnique,
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
} from 'class-validator';
import {
  Designation,
  VehicleDocType,
  VehicleOwnerShip,
  VehicleStatus,
} from '../../database/entities/vehicle.entity';

export class CreateVehicleDto {
  @IsEnum(VehicleOwnerShip)
  ownership: VehicleOwnerShip;

  @IsString()
  @MinLength(1)
  ownerFirstName: string;

  @IsString()
  @MinLength(1)
  ownerLastName: string;

  @IsString()
  @MinLength(1)
  contactPersonName: string;

  @IsString()
  @MinLength(5)
  contactNo: string;

  @IsEnum(Designation)
  Designation: Designation;

  @IsString()
  @MinLength(1)
  regNo: string;

  @IsString()
  @MinLength(1)
  enginNo: string;

  @IsString()
  @MinLength(1)
  chassisNo: string;

  @IsUUID()
  vehicleTypeId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  vehicleSizeId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  vehicleCapacityId?: string | null;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsEnum(VehicleOwnerShip)
  ownership?: VehicleOwnerShip;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerFirstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerLastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  contactNo?: string;

  @IsOptional()
  @IsEnum(Designation)
  Designation?: Designation;

  @IsOptional()
  @IsString()
  @MinLength(1)
  regNo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  enginNo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  chassisNo?: string;

  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  vehicleSizeId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  vehicleCapacityId?: string | null;

  /** Replace full image key list, or `null` to clear all images */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  vehicleImages?: string[] | null;
}

export class RemoveVehicleImageDto {
  @IsString()
  @MinLength(1)
  key: string;
}

export class ChangeVehicleStatusDto {
  @IsEnum(VehicleStatus)
  status: VehicleStatus;
}

export class VehicleListQueryDto {
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
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(VehicleOwnerShip)
  ownership?: VehicleOwnerShip;

  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleSizeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleCapacityId?: string;
}

export class UploadVehicleDocumentDto {
  @IsEnum(VehicleDocType)
  docType: VehicleDocType;

  @IsDateString()
  validity: string;

  @IsOptional()
  @IsString()
  name?: string;
}
