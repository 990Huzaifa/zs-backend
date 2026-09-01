import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateBusinessInfoSettingDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  companyName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  tagLine?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ptcl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;
}
