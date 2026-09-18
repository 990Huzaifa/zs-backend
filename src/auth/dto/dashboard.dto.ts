import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum RevenueOverviewPeriod {
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
}

export class DashboardQueryDto {
  /** Graph range start (YYYY-MM-DD). Cards & chart are all-time. Defaults to 7 days ending today. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Graph range end (YYYY-MM-DD). Cards & chart are all-time. Defaults to today. */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** Revenue Overview card period. Defaults to this_month. */
  @IsOptional()
  @IsEnum(RevenueOverviewPeriod)
  revenuePeriod?: RevenueOverviewPeriod;
}

export class RevenueOverviewQueryDto {
  /** Card dropdown: This Month / Last Month. Defaults to this_month. */
  @IsOptional()
  @IsEnum(RevenueOverviewPeriod)
  period?: RevenueOverviewPeriod;
}
