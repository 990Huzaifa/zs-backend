import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

function toBoolean({ value }: { value: unknown }) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return value;
}

function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  return toBoolean({ value });
}

export class CreateTransportationProductDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  status?: boolean;
}

export class UpdateTransportationProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class ChangeTransportationProductStatusDto {
  @Transform(toBoolean)
  @IsBoolean()
  status: boolean;
}

export class TransportationProductListQueryDto {
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
  @Transform(toOptionalBoolean)
  @IsBoolean()
  status?: boolean;
}

export class TransportationProductUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  status?: boolean;
}
