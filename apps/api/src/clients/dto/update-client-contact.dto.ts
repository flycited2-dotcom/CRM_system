import { PartialType } from '@nestjs/mapped-types';
import { CreateClientContactDto } from './create-client-contact.dto';

export class UpdateClientContactDto extends PartialType(CreateClientContactDto) {}
