import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
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
  TripDocStatus,
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

export class UpdateTripLoadDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  biltyId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  toDetails?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  deliveryChallanNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  productDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  driverIds: string[];

  @IsDateString()
  tripDate: string;

  @IsOptional()
  @IsString()
  odoReading?: string | null;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsEnum(TripDocStatus)
  docStatus?: TripDocStatus;

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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  driverIds?: string[];

  @IsOptional()
  @IsDateString()
  tripDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  odoReading?: string | null;

  @IsOptional()
  @IsEnum(TripDocStatus)
  docStatus?: TripDocStatus;

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

export class ChangeTripDocStatusDto {
  @IsEnum(TripDocStatus)
  docStatus: TripDocStatus;
}

export class ChangeTripLoadStatusDto {
  @IsEnum(TripLoadStatus)
  status: TripLoadStatus;
}

export class ChangeTripExpenseStatusDto {
  @IsEnum(TripExpenseStatus)
  status: TripExpenseStatus;
}

/** Partial edit — pending: account/vendor allowed; paid: amount/date/description only. */
export class UpdateTripOfficeExpenseDto {
  @IsOptional()
  @IsUUID()
  assetAccountId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;
}

export class UpdateTripPumpExpenseDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;
}

export class UpdateTripFuelExpenseDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  vendorProductId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;
}

export class UpdateTripAssetExpenseDto {
  @IsOptional()
  @IsUUID()
  assetAccountId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;
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
  @IsEnum(TripDocStatus)
  docStatus?: TripDocStatus;

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
