import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { LogType } from '../../database/entities/warehousing/inventory.entity';

export class CreateSecondaryInventoryDto {
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
}

export class SecondaryInventoryListQueryDto {
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
  primaryInventoryId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  /** Match stockCode / InvoiceNo / shop name / DC number */
  @IsOptional()
  @IsString()
  search?: string;
}

export class CheckSecondaryInvoiceQueryDto {
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
  secondaryInventoryId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsUUID()
  primaryInventoryId?: string;

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
