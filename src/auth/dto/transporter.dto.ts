import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TranspoterStatus } from '../../database/entities/transporter.entity';

export class CreateTransporterDto {
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
  @IsEnum(TranspoterStatus)
  status?: TranspoterStatus;
}

export class UpdateTransporterDto {
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

export class ChangeTransporterStatusDto {
  @IsEnum(TranspoterStatus)
  status: TranspoterStatus;
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

  @IsOptional()
  @IsEnum(TranspoterStatus)
  status?: TranspoterStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;
}

export class CreateTransporterContactDto {
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

export class UpdateTransporterContactDto {
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
