import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class CreateTenderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tenderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  region?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  nmck?: number;

  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @IsOptional()
  @IsDateString()
  submissionDeadline?: string;

  @IsOptional()
  @IsDateString()
  auctionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  procurementLaw?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  requirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}
