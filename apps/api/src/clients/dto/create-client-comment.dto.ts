import { IsString, MinLength } from 'class-validator';

export class CreateClientCommentDto {
  @IsString()
  @MinLength(1)
  text: string;
}
