import { IsDateString, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  /** Graph & chart range start (YYYY-MM-DD). Defaults to 7 days ending today. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Graph & chart range end (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
