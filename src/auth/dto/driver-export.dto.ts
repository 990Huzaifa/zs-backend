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
  DriverLicenseType,
  DriverStatus,
  DriverType,
  EmployeerType,
} from '../../database/entities/driver.entity';
import {
  ExportFormat,
  ExportMode,
} from '../../database/entities/export-job.entity';

export class DriverExportFiltersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;

  @IsOptional()
  @IsEnum(EmployeerType)
  employeerType?: EmployeerType;

  @IsOptional()
  @IsEnum(DriverLicenseType)
  licenseType?: DriverLicenseType;
}

export class CreateDriverExportDto {
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @IsEnum(ExportMode)
  mode: ExportMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  driverIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DriverExportFiltersDto)
  filters?: DriverExportFiltersDto;
}
