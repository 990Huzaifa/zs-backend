import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AccountsPayableListQueryDto {
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
  @IsUUID()
  vendorId?: string;

  /** Inclusive period start (optional). */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Inclusive as-of / period end (optional). Defaults to today for balances. */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
