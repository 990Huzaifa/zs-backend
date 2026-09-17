import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';

/** Single row inside batch create */
export class CreateVendorVoucherEntryDto {
  @IsUUID()
  vendorId: string;

  @IsUUID()
  assetAccId: string;

  @IsUUID()
  vendorAccId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateIf(
    (o: CreateVendorVoucherEntryDto) =>
      o.paymentMethod === PaymentMethod.CHEQUE,
  )
  @IsString()
  @MinLength(1)
  chequeNumber?: string;

  @ValidateIf(
    (o: CreateVendorVoucherEntryDto) =>
      o.paymentMethod === PaymentMethod.CHEQUE,
  )
  @IsDateString()
  chequeDate?: string;

  @IsDateString()
  paymentDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  paymentAmount: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

/**
 * Batch create — shared status for all entries
 * (Save as draft → PENDING, Save & Paid → PAID).
 */
export class CreateVendorVoucherBatchDto {
  @IsIn([VoucherStatus.PENDING, VoucherStatus.PAID])
  status: VoucherStatus.PENDING | VoucherStatus.PAID;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVendorVoucherEntryDto)
  entries: CreateVendorVoucherEntryDto[];
}

export class UpdateVendorVoucherDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  assetAccId?: string;

  @IsOptional()
  @IsUUID()
  vendorAccId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MinLength(1)
  chequeNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  chequeDate?: string | null;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  paymentAmount?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  remarks?: string | null;
}

export class ChangeVendorVoucherStatusDto {
  @IsEnum(VoucherStatus)
  status: VoucherStatus;
}

export class VendorVoucherListQueryDto {
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
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  assetAccId?: string;

  @IsOptional()
  @IsUUID()
  vendorAccId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
