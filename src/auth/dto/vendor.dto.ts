import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  VendorStatus,
  VendorTaxStatus,
} from '../../database/entities/vendor.entity';

export class CreateVendorDto {
  @IsUUID()
  vendorCategoryId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  altPhone?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsEnum(VendorTaxStatus)
  taxStatus?: VendorTaxStatus;

  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsString()
  address?: string;

  @Type(() => Number)
  @IsInt()
  stateId: number;

  @Type(() => Number)
  @IsInt()
  cityId: number;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;
}

export class UpdateVendorDto {
  @IsOptional()
  @IsUUID()
  vendorCategoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  altPhone?: string | null;

  @IsOptional()
  @IsString()
  bankName?: string | null;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string | null;

  @IsOptional()
  @IsEnum(VendorTaxStatus)
  taxStatus?: VendorTaxStatus;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsString()
  zipCode?: string | null;

  @IsOptional()
  @IsString()
  lat?: string | null;

  @IsOptional()
  @IsString()
  lng?: string | null;
}

export class ChangeVendorStatusDto {
  @IsEnum(VendorStatus)
  status: VendorStatus;
}

export class VendorListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsEnum(VendorTaxStatus)
  taxStatus?: VendorTaxStatus;

  @IsOptional()
  @IsUUID()
  vendorCategoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;
}
