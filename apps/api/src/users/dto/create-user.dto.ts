import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  roleCode: string;
}
