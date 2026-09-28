import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ShopCategoryListQueryDto {
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

export class CreateShopCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class UpdateShopCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
