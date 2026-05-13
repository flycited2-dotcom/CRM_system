import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions('audit.view')
  list(@Query('limit') limit?: string) {
    return this.auditService.list(limit ? Number(limit) : 100);
  }
}
