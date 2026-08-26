import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClientTypeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}

export class UpdateClientTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;
}
