import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BrokerStatus } from '../../database/entities/broker.entity';

export class CreateBrokerDto {
  @IsString()
  @MinLength(1)
  companyName: string;

  @IsString()
  @MinLength(1)
  ownerName: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  ntn?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  lat?: string | null;

  @IsOptional()
  @IsString()
  lng?: string | null;

  @Type(() => Number)
  @IsInt()
  stateId: number;

  @Type(() => Number)
  @IsInt()
  cityId: number;

  @IsOptional()
  @IsString()
  zipCode?: string | null;

  @IsOptional()
  @IsString()
  avatar?: string | null;

  @IsOptional()
  @IsEnum(BrokerStatus)
  status?: BrokerStatus;
}

export class UpdateBrokerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  ntn?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  lat?: string | null;

  @IsOptional()
  @IsString()
  lng?: string | null;

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
  avatar?: string | null;
}

export class ChangeBrokerStatusDto {
  @IsEnum(BrokerStatus)
  status: BrokerStatus;
}

export class BrokerListQueryDto {
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
  @IsEnum(BrokerStatus)
  status?: BrokerStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;
}

export class CreateBrokerContactDto {
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

export class UpdateBrokerContactDto {
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

export class UploadBrokerDocumentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  validity?: string | null;
}
