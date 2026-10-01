import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import {
  BiltyFreightPartyType,
  BiltyFreightVoucherType,
} from '../../database/entities/bilty.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';

/** Nested create under /biltys/:id/freights (biltyId from path). */
export class CreateBiltyFreightDto {
  /**
   * Defaults from payload ids / bilty defaults:
   * - transporterId present → TRANSPORTER
   * - else → BROKER
   */
  @IsOptional()
  @IsEnum(BiltyFreightPartyType)
  partyType?: BiltyFreightPartyType;

  /** Defaults to bilty.brokerId when party is BROKER and omitted */
  @IsOptional()
  @IsUUID()
  brokerId?: string;

  /** Defaults to bilty.transporterId when party is TRANSPORTER and omitted */
  @IsOptional()
  @IsUUID()
  transporterId?: string;

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

  @IsOptional()
  @IsString()
  transactionNo?: string | null;

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

/** Top-level create on /bilty-freights */
export class CreateBiltyFreightBodyDto extends CreateBiltyFreightDto {
  @IsUUID()
  biltyId: string;
}

export class UpdateBiltyFreightDto {
  @IsOptional()
  @IsEnum(BiltyFreightPartyType)
  partyType?: BiltyFreightPartyType;

  @IsOptional()
  @IsUUID()
  brokerId?: string | null;

  @IsOptional()
  @IsUUID()
  transporterId?: string | null;

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
  @ValidateIf((_, v) => v !== null)
  @IsString()
  transactionNo?: string | null;

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

export class RemoveBiltyFreightProofImageDto {
  @IsString()
  @MinLength(1)
  key: string;
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
  @IsEnum(BiltyFreightPartyType)
  partyType?: BiltyFreightPartyType;

  @IsOptional()
  @IsUUID()
  biltyId?: string;

  @IsOptional()
  @IsUUID()
  brokerId?: string;

  @IsOptional()
  @IsUUID()
  transporterId?: string;

  @IsOptional()
  @IsUUID()
  assetAccId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
