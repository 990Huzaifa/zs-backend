import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum CashBankAccountTypeFilter {
  CASH = 'CASH',
  BANK = 'BANK',
}

export class CashBankBalanceListQueryDto {
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

  /** Limit to Cash or Bank leaves only. */
  @IsOptional()
  @IsEnum(CashBankAccountTypeFilter)
  accountType?: CashBankAccountTypeFilter;

  /** Inclusive period start (optional). */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Inclusive as-of / period end (optional). Defaults to today for balances. */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
