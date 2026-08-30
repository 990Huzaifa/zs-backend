import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  TripExpenseStatus,
  TripLoadStatus,
  TripStatus,
} from '../../database/entities/trip.entity';

export class CreateTripLoadDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  biltyId: string;

  @IsOptional()
  @IsString()
  toDetails?: string | null;

  @IsOptional()
  @IsString()
  deliveryChallanNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingDate?: string | null;

  @IsOptional()
  @IsString()
  productDescription?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  netWeight?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cartonCount?: number | null;

  @IsOptional()
  @IsEnum(TripLoadStatus)
  status?: TripLoadStatus;
}

export class CreateTripOfficeExpenseDto {
  @IsUUID()
  assetAccountId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(TripExpenseStatus)
  status?: TripExpenseStatus;
}

export class CreateTripPumpExpenseDto {
  @IsUUID()
  vendorId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(TripExpenseStatus)
  status?: TripExpenseStatus;
}

export class CreateTripFuelExpenseDto {
  @IsUUID()
  vendorId: string;

  @IsUUID()
  vendorProductId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(TripExpenseStatus)
  status?: TripExpenseStatus;
}

export class CreateTripAssetExpenseDto {
  @IsUUID()
  assetAccountId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(TripExpenseStatus)
  status?: TripExpenseStatus;
}

export class CreateTripDto {
  @IsUUID()
  vehicleId: string;

  @IsUUID()
  driverId: string;

  @IsDateString()
  tripDate: string;

  @IsOptional()
  @IsString()
  odoReading?: string | null;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripLoadDto)
  upcountryLoads?: CreateTripLoadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripLoadDto)
  downcountryLoads?: CreateTripLoadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripOfficeExpenseDto)
  officeExpenses?: CreateTripOfficeExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripPumpExpenseDto)
  pumpExpenses?: CreateTripPumpExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripFuelExpenseDto)
  fuelExpenses?: CreateTripFuelExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripAssetExpenseDto)
  mtagExpenses?: CreateTripAssetExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripAssetExpenseDto)
  otherExpenses?: CreateTripAssetExpenseDto[];
}

export class UpdateTripDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsDateString()
  tripDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  odoReading?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripLoadDto)
  upcountryLoads?: CreateTripLoadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripLoadDto)
  downcountryLoads?: CreateTripLoadDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripOfficeExpenseDto)
  officeExpenses?: CreateTripOfficeExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripPumpExpenseDto)
  pumpExpenses?: CreateTripPumpExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripFuelExpenseDto)
  fuelExpenses?: CreateTripFuelExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripAssetExpenseDto)
  mtagExpenses?: CreateTripAssetExpenseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTripAssetExpenseDto)
  otherExpenses?: CreateTripAssetExpenseDto[];
}

export class ChangeTripStatusDto {
  @IsEnum(TripStatus)
  status: TripStatus;
}

export class ChangeTripLoadStatusDto {
  @IsEnum(TripLoadStatus)
  status: TripLoadStatus;
}

export class ChangeTripExpenseStatusDto {
  @IsEnum(TripExpenseStatus)
  status: TripExpenseStatus;
}

export class TripListQueryDto {
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
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  tripDateFrom?: string;

  @IsOptional()
  @IsDateString()
  tripDateTo?: string;
}
