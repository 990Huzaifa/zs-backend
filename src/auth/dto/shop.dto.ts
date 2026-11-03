import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const SHOP_LIST_SORT_BY = ['shopCode', 'shopName'] as const;
export type ShopListSortBy = (typeof SHOP_LIST_SORT_BY)[number];

export const SHOP_LIST_SORT_ORDER = ['ASC', 'DESC'] as const;
export type ShopListSortOrder = (typeof SHOP_LIST_SORT_ORDER)[number];

export class ShopListQueryDto {
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

  /** Exact / ILIKE city filter */
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsUUID()
  shopCategoryId?: string;

  /** Default `shopName` when omitted */
  @IsOptional()
  @IsIn(SHOP_LIST_SORT_BY)
  sortBy?: ShopListSortBy;

  /** Default `ASC` */
  @IsOptional()
  @IsIn(SHOP_LIST_SORT_ORDER)
  sortOrder?: ShopListSortOrder;
}

export class CreateShopDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  shopCategoryId?: string | null;

  @IsString()
  @MinLength(1)
  shopName: string;

  @IsString()
  @MinLength(1)
  inchargeName: string;

  /** PTCL / landline (formerly inchargePhone) */
  @IsString()
  @MinLength(1)
  ptcl: string;

  @IsString()
  @MinLength(1)
  branchCode: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  state?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  lat?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  lng?: string | null;
}

export class UpdateShopDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  shopCategoryId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  shopName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  inchargeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ptcl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  branchCode?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  state?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  lat?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  lng?: string | null;
}
