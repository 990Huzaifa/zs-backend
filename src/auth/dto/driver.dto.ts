import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  DriverDocType,
  DriverLicenseType,
  DriverStatus,
  DriverType,
} from '../../database/entities/driver.entity';

export class CreateDriverDto {
  /** Login / display name for auto-created User */
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  /** Optional; defaults to seeded DRIVER role */
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsEnum(DriverType)
  driverType: DriverType;

  @IsString()
  @MinLength(1)
  fatherName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  altPhone?: string;

  @IsOptional()
  @IsString()
  licenseNo?: string;

  @IsEnum(DriverLicenseType)
  licenseType: DriverLicenseType;

  @IsOptional()
  @IsString()
  currentAddress?: string;

  @IsOptional()
  @IsString()
  permenantAddress?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string | null;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fatherName?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  altPhone?: string | null;

  @IsOptional()
  @IsString()
  licenseNo?: string | null;

  @IsOptional()
  @IsEnum(DriverLicenseType)
  licenseType?: DriverLicenseType;

  @IsOptional()
  @IsString()
  currentAddress?: string | null;

  @IsOptional()
  @IsString()
  permenantAddress?: string | null;
}

export class ChangeDriverStatusDto {
  @IsEnum(DriverStatus)
  status: DriverStatus;
}

export class DriverListQueryDto {
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
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(DriverType)
  driverType?: DriverType;

  @IsOptional()
  @IsEnum(DriverLicenseType)
  licenseType?: DriverLicenseType;
}

export class UploadDriverDocumentDto {
  @IsEnum(DriverDocType)
  docType: DriverDocType;

  @IsDateString()
  validity: string;

  @IsOptional()
  @IsString()
  name?: string;
}
