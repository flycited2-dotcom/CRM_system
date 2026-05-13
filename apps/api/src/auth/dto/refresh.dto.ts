import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
