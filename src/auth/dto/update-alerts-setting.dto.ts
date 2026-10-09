import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAlertsSettingDto {
  /** Days before due date when warning alerts start (0–3650). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  warningDaysBefore?: number;

  /** Days before due date when severity becomes critical (0–3650). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  criticalDaysBefore?: number;
}
