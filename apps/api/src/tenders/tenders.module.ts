import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService]
})
export class TendersModule {}
