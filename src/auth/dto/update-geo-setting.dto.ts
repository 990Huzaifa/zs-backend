import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateGeoSettingDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  defaultCountryId?: string | null;
}
