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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PurchaseQuotationItemType } from '../../database/entities/maintenance/purchase-quotation.entity';
import {
  PurchaseOrderReceivingStatus,
  PurchaseOrderStatus,
} from '../../database/entities/maintenance/purchase-order.entity';

export class CreatePurchaseOrderFromQuotationDto {
  @IsUUID()
  purchaseQuotationId: string;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string | null;

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

  /** Default draft. Allow pending_approval on create. */
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus.DRAFT | PurchaseOrderStatus.PENDING_APPROVAL;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  termsAndConditions?: string | null;
}

export class CreatePurchaseOrderItemDto {
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

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string | null;

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
  remarks?: string | null;

  @IsOptional()
  @IsString()
  termsAndConditions?: string | null;
}

export class ChangePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;
}

export class UpdatePurchaseOrderItemDto {
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

export class ReplacePurchaseOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}

export class PurchaseOrderListQueryDto {
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
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsEnum(PurchaseOrderReceivingStatus)
  receivingStatus?: PurchaseOrderReceivingStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  purchaseQuotationId?: string;

  @IsOptional()
  @IsUUID()
  jobCardId?: string;
}
