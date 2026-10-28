import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  BiltyLoadType,
  BiltyStatus,
} from '../../database/entities/bilty.entity';

/** Sort fields for `GET /biltys`. */
export const BILTY_LIST_SORT_BY = ['code', 'createdAt', 'issueDate'] as const;
export type BiltyListSortBy = (typeof BILTY_LIST_SORT_BY)[number];

export const BILTY_LIST_SORT_ORDER = ['ASC', 'DESC'] as const;
export type BiltyListSortOrder = (typeof BILTY_LIST_SORT_ORDER)[number];

// Re-export freight DTOs for convenience
export {
  BiltyFreightListQueryDto,
  ChangeBiltyFreightStatusDto,
  CreateBiltyFreightBodyDto,
  CreateBiltyFreightDto,
  RemoveBiltyFreightProofImageDto,
  UpdateBiltyFreightDto,
} from './bilty-freight.dto';


export class BiltyStopContactDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  /** Optional stop date (ISO date or datetime string). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  loadingDate?: string | null;

  /** Optional document / challan number for this stop. */
  @IsOptional()
  @IsString()
  docNo?: string | null;
}

export class CreateBiltyLoadingDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  departureDateTime?: string | null;

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

  @IsEnum(BiltyLoadType)
  loadType: BiltyLoadType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometer?: number | null;

  @IsUUID()
  driverId: string;

  /** Optional trip assignment (also synced when bilty is added to a trip load). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  tripId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  brokerId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  transporterId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  transportationProductId?: string | null;

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

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  description?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  totalWeight?: string | null;

  @IsOptional()
  @IsString()
  noOfPackages?: string | null;

  /** Defaults to transporter company name when transporterId is set. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  transporterName?: string | null;

  /** Legacy FE spelling (whitelist) — same as transporterName. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  transaportorName?: string | null;

  @IsOptional()
  @IsString()
  transporterPhone?: string | null;

  /** Legacy FE spelling (whitelist) — same as transporterPhone. */
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
  @IsEnum(BiltyLoadType)
  loadType?: BiltyLoadType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometer?: number | null;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  /** Optional trip assignment — pass `null` to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  tripId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  brokerId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  transporterId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  transportationProductId?: string | null;

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
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

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
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  transporterName?: string | null;

  /** Legacy FE spelling (whitelist) — same as transporterName. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  transaportorName?: string | null;

  @IsOptional()
  @IsString()
  transporterPhone?: string | null;

  /** Legacy FE spelling (whitelist) — same as transporterPhone. */
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

  /** Issue date range start (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Issue date range end (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /**
   * Loading departure datetime range start (YYYY-MM-DD or ISO datetime).
   * Matches any `bilty_loadings.departureDateTime` on the bilty.
   */
  @IsOptional()
  @IsDateString()
  departureDateFrom?: string;

  /**
   * Loading departure datetime range end (YYYY-MM-DD or ISO datetime).
   * Date-only values include the full end day.
   */
  @IsOptional()
  @IsDateString()
  departureDateTo?: string;

  /**
   * Offloading datetime range start (YYYY-MM-DD or ISO datetime).
   * Matches any `bilty_off_loadings.offLoadingDateTime` on the bilty.
   */
  @IsOptional()
  @IsDateString()
  offLoadingDateFrom?: string;

  /**
   * Offloading datetime range end (YYYY-MM-DD or ISO datetime).
   * Date-only values include the full end day.
   */
  @IsOptional()
  @IsDateString()
  offLoadingDateTo?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  /** Match fleet `vehicle.regNo` or free-text `vehicleRegistrationNumber`. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleRegNo?: string;

  /** Exact fleet vehicle link. */
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  /** Filter via linked fleet vehicle masters (no match for free-text-only biltys). */
  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleSizeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleCapacityId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsOptional()
  @IsUUID()
  transporterId?: string;

  @IsOptional()
  @IsUUID()
  transportationProductId?: string;

  /** UP_COUNTRY / DOWN_COUNTRY — trip load bilty picker. */
  @IsOptional()
  @IsEnum(BiltyLoadType)
  loadType?: BiltyLoadType;

  /**
   * When true: only biltys with no non-cancelled trip load.
   * Combine with `tripId` to also include biltys already on that trip (edit exception).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  unassigned?: boolean;

  /**
   * Alone: only biltys linked to this trip (non-cancelled).
   * With `unassigned=true`: unassigned OR linked to this trip.
   */
  @IsOptional()
  @IsUUID()
  tripId?: string;

  /**
   * Sort column. Default `createdAt`.
   * Use `code` for bilty-code order (e.g. DCN-00001 …).
   */
  @IsOptional()
  @IsIn([...BILTY_LIST_SORT_BY])
  sortBy?: BiltyListSortBy;

  /** Sort direction. Default `DESC` (`ASC` when `sortBy=code` if omitted). */
  @IsOptional()
  @IsIn([...BILTY_LIST_SORT_ORDER])
  sortOrder?: BiltyListSortOrder;
}
