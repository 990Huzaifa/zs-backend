import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
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
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';

export class CreateContraVoucherDto {
  @IsUUID()
  fromAccId: string;

  @IsUUID()
  toAccId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateIf((o: CreateContraVoucherDto) => o.paymentMethod === PaymentMethod.CHEQUE)
  @IsString()
  @MinLength(1)
  chequeNumber?: string;

  @ValidateIf((o: CreateContraVoucherDto) => o.paymentMethod === PaymentMethod.CHEQUE)
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

export class UpdateContraVoucherDto {
  @IsOptional()
  @IsUUID()
  fromAccId?: string;

  @IsOptional()
  @IsUUID()
  toAccId?: string;

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

export class ChangeContraVoucherStatusDto {
  @IsEnum(VoucherStatus)
  status: VoucherStatus;
}

export class ContraVoucherListQueryDto {
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
  fromAccId?: string;

  @IsOptional()
  @IsUUID()
  toAccId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
