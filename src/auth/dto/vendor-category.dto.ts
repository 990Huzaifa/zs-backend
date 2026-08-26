import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVendorCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class UpdateVendorCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}
