import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  BiltyFreightVoucherType,
  BiltyStatus,
} from '../../database/entities/bilty.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number | null;

  @IsUUID()
  driverId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  brokerId?: string | null;

  @IsUUID()
  transporterId: string;

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

  /** Defaults to transporter company name when omitted. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  transaportorName?: string;

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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedHours?: number | null;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUUID()
  brokerId?: string | null;

  @IsOptional()
  @IsUUID()
  transporterId?: string;

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
  @MinLength(1)
  transaportorName?: string;

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

  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsOptional()
  @IsUUID()
  transporterId?: string;
}

export class CreateBiltyFreightDto {
  /** Defaults to bilty.brokerId when omitted */
  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsUUID()
  assetAccId: string;

  @IsEnum(BiltyFreightVoucherType)
  voucherType: BiltyFreightVoucherType;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateIf(
    (o: CreateBiltyFreightDto) => o.paymentMethod === PaymentMethod.CHEQUE,
  )
  @IsString()
  @MinLength(1)
  chequeNumber?: string;

  @ValidateIf(
    (o: CreateBiltyFreightDto) => o.paymentMethod === PaymentMethod.CHEQUE,
  )
  @IsDateString()
  chequeDate?: string;

  @ValidateIf(
    (o: CreateBiltyFreightDto) => o.paymentMethod === PaymentMethod.CHEQUE,
  )
  @IsString()
  @MinLength(1)
  chequeBank?: string;

  @IsDateString()
  paymentDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  paymentAmount: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /** Create as draft (PENDING) or post immediately (PAID). Default PENDING. */
  @IsOptional()
  @IsIn([VoucherStatus.PENDING, VoucherStatus.PAID])
  status?: VoucherStatus.PENDING | VoucherStatus.PAID;
}

export class UpdateBiltyFreightDto {
  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsOptional()
  @IsUUID()
  assetAccId?: string;

  @IsOptional()
  @IsEnum(BiltyFreightVoucherType)
  voucherType?: BiltyFreightVoucherType;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  chequeNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  chequeDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  chequeBank?: string | null;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ChangeBiltyFreightStatusDto {
  @IsEnum(VoucherStatus)
  status: VoucherStatus;
}

export class BiltyFreightListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;

  @IsOptional()
  @IsEnum(BiltyFreightVoucherType)
  voucherType?: BiltyFreightVoucherType;

  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsOptional()
  @IsUUID()
  assetAccId?: string;
}
