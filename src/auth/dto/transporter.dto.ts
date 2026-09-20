import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateTransporterDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsString()
  @MinLength(1)
  phoneNumber: string;
}

export class UpdateTransporterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phoneNumber?: string;
}

export class TransporterListQueryDto {
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
