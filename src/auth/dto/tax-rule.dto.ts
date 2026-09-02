import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  TaxRuleStatus,
  TaxRuleType,
} from '../../database/entities/tax-rule.entity';

export type TaxRuleDisplayStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'UPCOMING';

export class CreateTaxRuleDto {
  @IsEnum(TaxRuleType)
  type: TaxRuleType;

  @IsString()
  @MinLength(1)
  authority: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  rate: number;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsEnum(TaxRuleStatus)
  status?: TaxRuleStatus;
}

export class UpdateTaxRuleDto {
  @IsOptional()
  @IsEnum(TaxRuleType)
  type?: TaxRuleType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  authority?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  rate?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsEnum(TaxRuleStatus)
  status?: TaxRuleStatus;
}

export class ChangeTaxRuleStatusDto {
  @IsEnum(TaxRuleStatus)
  status: TaxRuleStatus;
}

export class TaxRuleListQueryDto {
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
  @IsEnum(TaxRuleType)
  type?: TaxRuleType;

  @IsOptional()
  @IsString()
  authority?: string;

  @IsOptional()
  @IsEnum(TaxRuleStatus)
  status?: TaxRuleStatus;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'EXPIRED', 'UPCOMING'])
  displayStatus?: TaxRuleDisplayStatus;
}
