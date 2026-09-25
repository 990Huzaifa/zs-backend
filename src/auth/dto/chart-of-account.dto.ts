import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ChartOfAccountKind } from '../../database/entities/chart-of-account.entity';

/** Asset subtypes for create-asset form (Cash / Bank). */
export enum CoaAssetType {
  CASH = 'CASH',
  BANK = 'BANK',
}

function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}

/** Supports `?parentCode=a&parentCode=b` and `?parentCode=a,b`. */
function toStringArray({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const items = raw.map((v) => String(v).trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export class ChartOfAccountListQueryDto {
  /** `tree` = nested hierarchy for expand/collapse UI (default). `flat` = paginated rows. */
  @IsOptional()
  @IsIn(['tree', 'flat'])
  view?: 'tree' | 'flat' = 'tree';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ChartOfAccountKind)
  accountKind?: ChartOfAccountKind;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isPostable?: boolean;

  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Filter by UI account type badge */
  @IsOptional()
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  accountType?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}

/**
 * Lightweight COA picker: children of one or more parent codes + current balance.
 * Query: `?parentCode=1-1-1&parentCode=1-1-2` or `?parentCode=1-1-1,1-1-2`
 */
export class ChartOfAccountListUtilityQueryDto {
  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  parentCode: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isPostable?: boolean;

  @IsOptional()
  @IsEnum(ChartOfAccountKind)
  accountKind?: ChartOfAccountKind;

  /** As-of date for balance (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

/**
 * Create a postable asset leaf under Cash (1-1-1) or Bank (1-1-2).
 * Optional opening balance posts an OPENING_BALANCE transaction (debit).
 */
export class CreateAssetAccountDto {
  @IsEnum(CoaAssetType)
  assetType: CoaAssetType;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  openingBalanceDate?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

/**
 * Create a postable expense leaf under Expenses (parent code 5).
 */
export class CreateExpenseAccountDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
