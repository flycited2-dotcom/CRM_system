import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationsService } from './integrations.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('settings.manage')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  list() {
    return this.integrationsService.list();
  }

  @Post()
  create(
    @Body() dto: CreateIntegrationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.integrationsService.create(dto, user, this.getRequestContext(request));
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntegrationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.integrationsService.update(id, dto, user, this.getRequestContext(request));
  }

  @Post(':id/rotate-key')
  rotateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.integrationsService.rotateKey(id, user, this.getRequestContext(request));
  }

  @Delete(':id')
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.integrationsService.softDelete(id, user, this.getRequestContext(request));
  }

  @Get(':id/logs')
  logs(@Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);

    return this.integrationsService.logs(id, Number.isInteger(parsed) && parsed > 0 ? parsed : 50);
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
