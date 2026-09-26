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
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PurchaseQuotationItemType,
  PurchaseQuotationStatus,
} from '../../database/entities/maintenance/purchase-quotation.entity';

export class CreatePurchaseQuotationItemDto {
  @IsEnum(PurchaseQuotationItemType)
  itemType: PurchaseQuotationItemType;

  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @IsString()
  @MinLength(1)
  itemName: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseQuotationDto {
  /** Null/omit = bulk procurement (no job card). */
  @IsOptional()
  @IsUUID()
  jobCardId?: string | null;

  @IsUUID()
  vendorId: string;

  @IsOptional()
  @IsString()
  vendorQuotationNo?: string | null;

  @IsDateString()
  quotationDate: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  /** Default draft. Allow submitted on create. */
  @IsOptional()
  @IsEnum(PurchaseQuotationStatus)
  status?: PurchaseQuotationStatus.DRAFT | PurchaseQuotationStatus.SUBMITTED;

  @IsOptional()
  @IsString()
  termsAndConditions?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseQuotationItemDto)
  items: CreatePurchaseQuotationItemDto[];
}

export class UpdatePurchaseQuotationDto {
  @IsOptional()
  @IsUUID()
  jobCardId?: string | null;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  vendorQuotationNo?: string | null;

  @IsOptional()
  @IsDateString()
  quotationDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsString()
  termsAndConditions?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ChangePurchaseQuotationStatusDto {
  @IsEnum(PurchaseQuotationStatus)
  status: PurchaseQuotationStatus;

  /**
   * When approving a job-card PQ, reject other submitted/draft PQs
   * for the same job card (select-one quotation flow).
   */
  @IsOptional()
  @IsBoolean()
  rejectSiblingQuotations?: boolean;
}

export class UpdatePurchaseQuotationItemDto {
  @IsOptional()
  @IsEnum(PurchaseQuotationItemType)
  itemType?: PurchaseQuotationItemType;

  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  itemName?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}

export class ReplacePurchaseQuotationItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseQuotationItemDto)
  items: CreatePurchaseQuotationItemDto[];
}

export class PurchaseQuotationListQueryDto {
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
  @IsEnum(PurchaseQuotationStatus)
  status?: PurchaseQuotationStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  jobCardId?: string;

  /** true = bulk only (jobCardId IS NULL); false = job-card linked only. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  bulkOnly?: boolean;
}
