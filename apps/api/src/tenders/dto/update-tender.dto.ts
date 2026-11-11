import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateTenderDto } from './create-tender.dto';

export class UpdateTenderDto extends PartialType(CreateTenderDto) {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  result?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  margin?: number;
}
