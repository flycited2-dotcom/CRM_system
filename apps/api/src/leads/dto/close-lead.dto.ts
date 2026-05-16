import { IsString } from 'class-validator';

export class CloseLeadDto {
  @IsString()
  closeReason!: string;
}
