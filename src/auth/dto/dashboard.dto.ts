import { IsDateString, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  /** Graph range start (YYYY-MM-DD). Cards & chart are all-time. Defaults to 7 days ending today. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Graph range end (YYYY-MM-DD). Cards & chart are all-time. Defaults to today. */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
