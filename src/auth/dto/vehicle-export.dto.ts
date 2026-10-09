import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  ExportFormat,
  ExportMode,
} from '../../database/entities/export-job.entity';
import {
  VehicleOwnerShip,
  VehicleStatus,
} from '../../database/entities/vehicle.entity';

export class VehicleExportFiltersDto {
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

export class CreateVehicleExportDto {
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @IsEnum(ExportMode)
  mode: ExportMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  vehicleIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleExportFiltersDto)
  filters?: VehicleExportFiltersDto;
}
