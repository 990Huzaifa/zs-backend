import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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

  @IsOptional()
  @IsDateString()
  joiningDate?: string | null;

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
  cnicNo?: string;

  @IsOptional()
  @IsString()
  licenseNo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  licenseOnlineVerification?: boolean;

  @IsEnum(DriverLicenseType)
  licenseType: DriverLicenseType;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString()
  licenseValidity?: string | null;

  @IsOptional()
  @IsString()
  currentAddress?: string;

  @IsOptional()
  @IsString()
  permenantAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  gurantorName?: string;

  @IsOptional()
  @IsString()
  gurantorPhone?: string;

  @IsOptional()
  @IsString()
  gurantorAddress?: string;

  @IsOptional()
  @IsString()
  gurantorCNIC?: string;

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
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString()
  joiningDate?: string | null;

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
  cnicNo?: string | null;

  @IsOptional()
  @IsString()
  licenseNo?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  licenseOnlineVerification?: boolean;

  @IsOptional()
  @IsEnum(DriverLicenseType)
  licenseType?: DriverLicenseType;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString()
  licenseValidity?: string | null;

  @IsOptional()
  @IsString()
  currentAddress?: string | null;

  @IsOptional()
  @IsString()
  permenantAddress?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string | null;

  @IsOptional()
  @IsString()
  gurantorName?: string | null;

  @IsOptional()
  @IsString()
  gurantorPhone?: string | null;

  @IsOptional()
  @IsString()
  gurantorAddress?: string | null;

  @IsOptional()
  @IsString()
  gurantorCNIC?: string | null;
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

  @IsOptional()
  @IsDateString()
  validity?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
