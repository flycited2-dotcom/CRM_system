import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkSessionsModule } from '../work-sessions/work-sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuditModule, WorkSessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
