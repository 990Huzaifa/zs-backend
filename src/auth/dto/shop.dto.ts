import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
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
  @IsString()
  @MinLength(1)
  shopName: string;

  @IsString()
  @MinLength(1)
  ownerName: string;

  @IsString()
  @MinLength(1)
  ownerPhone: string;

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
  @IsString()
  @MinLength(1)
  shopName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerPhone?: string;

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
