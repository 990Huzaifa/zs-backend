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
import { AssignedVehicleStatus } from '../../database/entities/driver.entity';

export class CreateAssignedVehicleDto {
  @IsUUID()
  driverId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsDateString()
  assignedDate?: string | null;

  @IsOptional()
  @IsEnum(AssignedVehicleStatus)
  status?: AssignedVehicleStatus;

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

export class UpdateAssignedVehicleDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

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

export class ChangeAssignedVehicleStatusDto {
  @IsEnum(AssignedVehicleStatus)
  status: AssignedVehicleStatus;
}

export class AssignedVehicleListQueryDto {
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
  driverId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsEnum(AssignedVehicleStatus)
  status?: AssignedVehicleStatus;
}
