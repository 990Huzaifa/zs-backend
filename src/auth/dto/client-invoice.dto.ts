import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { ClientInvoiceStatus } from '../../database/entities/client-invoice.entity';

export class CreateClientInvoiceItemDto {
  @IsUUID()
  tripId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightAmount: number;

  @IsUUID()
  saleTaxRuleId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saleTaxRate: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salesTaxAmount: number;

  @IsUUID()
  withholdingTaxRuleId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  withholdingTaxRate: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  withholdingTaxAmount: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netAmount: number;
}

export class CreateClientInvoiceDto {
  @IsUUID()
  clientId: string;

  @IsDateString()
  invoiceDate: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  note?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClientInvoiceItemDto)
  items: CreateClientInvoiceItemDto[];
}

export class UpdateClientInvoiceDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClientInvoiceItemDto)
  items?: CreateClientInvoiceItemDto[];
}

export class ChangeClientInvoiceStatusDto {
  @IsEnum(ClientInvoiceStatus)
  status: ClientInvoiceStatus;

  /** Required when marking `paid` — cash/bank postable account. */
  @ValidateIf((o) => o.status === ClientInvoiceStatus.PAID)
  @IsUUID()
  assetAccId?: string;

  /**
   * When `paid`: if true, post WHT receivable and bank receives net.
   * Default: true when invoice `withHoldingTaxAmount` > 0, else false.
   */
  @ValidateIf((o) => o.status === ClientInvoiceStatus.PAID)
  @IsOptional()
  @IsBoolean()
  taxWithheld?: boolean;

  /** When `paid`: ledger date (defaults to today). */
  @ValidateIf((o) => o.status === ClientInvoiceStatus.PAID)
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}

export class ClientInvoiceListQueryDto {
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
  @IsEnum(ClientInvoiceStatus)
  invoiceStatus?: ClientInvoiceStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
