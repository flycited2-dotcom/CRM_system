import { Type } from 'class-transformer';
import { ClientStatus, ClientType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from 'class-validator';
import { CreateClientContactDto } from './create-client-contact.dto';

export class CreateClientDto {
  @IsEnum(ClientType)
  type: ClientType;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  inn?: string;

  @IsOptional()
  @IsString()
  kpp?: string;

  @IsOptional()
  @IsString()
  ogrn?: string;

  @IsOptional()
  @IsString()
  legalAddress?: string;

  @IsOptional()
  @IsString()
  actualAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientContactDto)
  contacts?: CreateClientContactDto[];
}
