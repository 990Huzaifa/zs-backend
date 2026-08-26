import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateGeoSettingDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  defaultCountryId?: string | null;
}
