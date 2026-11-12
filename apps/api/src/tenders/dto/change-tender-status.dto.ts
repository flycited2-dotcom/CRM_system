import { TenderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeTenderStatusDto {
  @IsEnum(TenderStatus)
  status: TenderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  result?: string;
}
