import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ClientsController],
  providers: [ClientsService]
})
export class ClientsModule {}
