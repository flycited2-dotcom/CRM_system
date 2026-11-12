import { IntegrationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateIntegrationDto {
  @IsEnum(IntegrationType)
  type: IntegrationType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  // Written into lead.source / tender.source, so keep it short and stable.
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{1,48}$/, {
    message: 'code must be 2-49 characters: lowercase latin letters, digits, dot, dash, underscore'
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
