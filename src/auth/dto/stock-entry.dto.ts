import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { LogType } from '../../database/entities/warehousing/inventory.entity';

/** Creates an inventory_logs row (INVENTORY_IN) + updates shop stock balance. */
export class CreateStockEntryDto {
  @IsUUID()
  primaryInventoryId: string;

  @IsUUID()
  shopId: string;

  @IsString()
  @MinLength(1)
  InvoiceNo: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  noOfCartons: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noOfPairs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedCartons?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnedCartons?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  /** Optional proof image keys/URLs */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  proofImages?: string[] | null;
}

export class CheckStockEntryInvoiceQueryDto {
  @IsString()
  @MinLength(1)
  invoiceNo: string;
}

export class InventoryLogListQueryDto {
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
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  primaryInventoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LogType)
  logType?: LogType;
}

export class StockBalanceListQueryDto {
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
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;
}
