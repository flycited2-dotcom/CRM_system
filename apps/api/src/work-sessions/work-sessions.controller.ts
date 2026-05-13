import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { WorkSessionsService } from './work-sessions.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('work-sessions')
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

  @Get()
  @Permissions('work_sessions.view')
  list() {
    return this.workSessionsService.list();
  }

  @Get('my')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.workSessionsService.listMine(user.id);
  }

  @Get('report')
  @Permissions('work_sessions.view')
  report() {
    return this.workSessionsService.list();
  }
}
