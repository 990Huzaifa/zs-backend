import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { VehicleTypeMeasurement } from '../../database/entities/vehicle.entity';

function toBoolean({ value }: { value: unknown }) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class CreateVehicleTypeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsEnum(VehicleTypeMeasurement)
  measurement: VehicleTypeMeasurement;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsEnum(VehicleTypeMeasurement)
  measurement?: VehicleTypeMeasurement;
}

export class CreateVehicleSizeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleSizeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class CreateVehicleCapacityDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleCapacityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class ChangeVehicleMasterStatusDto {
  @Transform(toBoolean)
  @IsBoolean()
  isActive: boolean;
}
