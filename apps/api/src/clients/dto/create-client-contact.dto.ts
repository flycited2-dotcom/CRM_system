import { ClientContactType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateClientContactDto {
  @IsEnum(ClientContactType)
  contactType: ClientContactType;

  @IsString()
  value: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
