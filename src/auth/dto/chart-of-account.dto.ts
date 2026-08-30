import { Transform, Type } from 'class-transformer';
import {
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
