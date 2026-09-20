import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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

  /**
   * Optional. Agar na bhejo to server client.withHeldtaxRate se fill karega.
   * Agar bhejo to salesTaxAmount × percent/100 se match hona chahiye.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  saleTaxWithheldPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saleTaxWithheldAmount?: number;

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

  /** Required when status = `submitted`. */
  @ValidateIf((o) => o.status === ClientInvoiceStatus.SUBMITTED)
  @IsDateString()
  submissionDate?: string;
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
