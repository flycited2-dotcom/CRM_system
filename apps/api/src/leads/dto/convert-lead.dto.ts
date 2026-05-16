import { IsOptional, IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
