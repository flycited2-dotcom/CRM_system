import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TendersModule } from '../tenders/tenders.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { IntegrationKeyGuard } from './integration-key.guard';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [PrismaModule, AuditModule, TendersModule],
  controllers: [IntegrationsController, IntakeController],
  providers: [IntegrationsService, IntakeService, IntegrationKeyGuard]
})
export class IntegrationsModule {}
