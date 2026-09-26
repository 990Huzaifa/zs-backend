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
  ValidateNested,
} from 'class-validator';
import { GRNStatus } from '../../database/entities/maintenance/grn.entity';

export class CreateGrnItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  receivedQuantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class CreateGrnDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsUUID()
  receivedById?: string | null;

  @IsOptional()
  @IsString()
  vendorDocumentNo?: string | null;

  @IsOptional()
  @IsEnum(GRNStatus)
  status?: GRNStatus.DRAFT | GRNStatus.PENDING_APPROVAL;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items: CreateGrnItemDto[];
}

export class UpdateGrnDto {
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsUUID()
  receivedById?: string | null;

  @IsOptional()
  @IsString()
  vendorDocumentNo?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ChangeGrnStatusDto {
  @IsEnum(GRNStatus)
  status: GRNStatus;
}

export class UpdateGrnItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  receivedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @IsString()
  remarks?: string | null;
}

export class ReplaceGrnItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items: CreateGrnItemDto[];
}

export class GrnListQueryDto {
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
  @IsEnum(GRNStatus)
  status?: GRNStatus;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
