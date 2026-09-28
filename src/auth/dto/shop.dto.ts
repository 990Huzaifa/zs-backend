import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

  @IsString()
  @MinLength(1)
  inchargePhone: string;

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
  inchargePhone?: string;

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
