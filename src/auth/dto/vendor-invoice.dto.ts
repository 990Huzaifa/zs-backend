import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VendorInvoiceStatus } from '../../database/entities/vendor/vendor-invoice.entity';

export class CreateVendorInvoiceDto {
  @IsUUID()
  vendorId: string;

  @IsDateString()
  invoiceDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  remarks?: string | null;

  /** Linked purchase / payable accounting transaction ids */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  transactionIds: string[];
}

export class UpdateVendorInvoiceDto {
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  transactionIds?: string[];
}

export class VendorInvoiceListQueryDto {
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
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsEnum(VendorInvoiceStatus)
  status?: VendorInvoiceStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
