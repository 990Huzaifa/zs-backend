import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  // Auto-generated user code (e.g. `EMP000001`) or legacy code (e.g. `USER000001`)
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  userCode?: string;

  @IsOptional()
  @IsString()
  usercode?: string;

  @IsString()
  @MinLength(6)
  password: string;
}
