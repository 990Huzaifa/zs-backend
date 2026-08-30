import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
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
  ClientDocType,
  ClientStatus,
} from '../../database/entities/client.entity';

export class CreateClientDto {
  @IsOptional()
  @IsDateString()
  joiningDate?: string | null;

  @IsString()
  @MinLength(1)
  companyName: string;

  @IsString()
  @MinLength(1)
  companyAddress: string;

  @IsString()
  @MinLength(1)
  postalCode: string;

  @Type(() => Number)
  @IsInt()
  cityId: number;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  ntn: string;

  @IsString()
  @MinLength(1)
  saleTaxNo: string;

  @IsOptional()
  @IsString()
  ptclNo?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  saleTaxTypeIds?: string[];

  @IsOptional()
  @IsBoolean()
  saleTaxStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  withHoldingTaxStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  isWarehouseOwner?: boolean;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}

export class UpdateClientDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString()
  joiningDate?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  postalCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ntn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  saleTaxNo?: string;

  @IsOptional()
  @IsString()
  ptclNo?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  saleTaxTypeIds?: string[];

  @IsOptional()
  @IsBoolean()
  saleTaxStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  withHoldingTaxStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  isWarehouseOwner?: boolean;
}

export class ChangeClientStatusDto {
  @IsEnum(ClientStatus)
  status: ClientStatus;
}

export class ClientListQueryDto {
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
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;
}

export class CreateClientContactDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  designation: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;

  @IsString()
  @MinLength(5)
  phone: string;
}

export class UpdateClientContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  designation?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(5)
  phone?: string;
}

export class ClientLocationListQueryDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}

export class CreateClientLocationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;

  @IsOptional()
  @IsString()
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  contactPersonPhone?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}

export class UpdateClientLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  address?: string;

  @IsOptional()
  @IsString()
  lat?: string | null;

  @IsOptional()
  @IsString()
  lng?: string | null;

  @IsOptional()
  @IsString()
  contactPersonName?: string | null;

  @IsOptional()
  @IsString()
  contactPersonPhone?: string | null;
}

export class UploadClientDocumentDto {
  @IsEnum(ClientDocType)
  docType: ClientDocType;

  @IsDateString()
  validity: string;

  @IsOptional()
  @IsString()
  name?: string;
}
