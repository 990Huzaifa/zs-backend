import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { DriverType } from '../../database/entities/driver.entity';
import { AssignedDriverStatus } from '../../database/entities/vehicle.entity';

export class CreateAssignedDriverDto {
  @IsUUID()
  vehicleId: string;

  @IsUUID()
  driverId: string;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;

  @IsOptional()
  @IsDateString()
  assignedDate?: string | null;

  @IsOptional()
  @IsEnum(AssignedDriverStatus)
  status?: AssignedDriverStatus;

  /** Assigned-by person name */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateAssignedDriverDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString()
  assignedDate?: string | null;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;
}

export class ChangeAssignedDriverStatusDto {
  @IsEnum(AssignedDriverStatus)
  status: AssignedDriverStatus;
}

export class AssignedDriverListQueryDto {
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
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(AssignedDriverStatus)
  status?: AssignedDriverStatus;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;
}
