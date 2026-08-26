import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ChartOfAccountKind } from '../../database/entities/chart-of-account.entity';

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
