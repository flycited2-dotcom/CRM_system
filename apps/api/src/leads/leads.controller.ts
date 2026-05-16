import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CloseLeadDto } from './dto/close-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Permissions('leads.view')
  list(@Query() query: LeadQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.list(query, user);
  }

  @Get(':id')
  @Permissions('leads.view')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.findById(id, user);
  }

  @Post()
  @Permissions('leads.create')
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.leadsService.create(dto, user, this.getRequestContext(request));
  }

  @Patch(':id')
  @Permissions('leads.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.leadsService.update(id, dto, user, this.getRequestContext(request));
  }

  @Post(':id/assign')
  @Permissions('leads.assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.leadsService.assign(id, dto, user, this.getRequestContext(request));
  }

  @Post(':id/close')
  @Permissions('leads.update')
  close(
    @Param('id') id: string,
    @Body() dto: CloseLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.leadsService.close(id, dto, user, this.getRequestContext(request));
  }

  @Post(':id/convert-to-deal')
  @Permissions('leads.convert')
  convertToDeal() {
    return this.leadsService.convertToDeal();
  }

  @Post(':id/convert-to-client')
  @Permissions('leads.convert')
  convertToClient(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.leadsService.convertToClient(id, dto, user, this.getRequestContext(request));
  }

  @Get(':id/history')
  @Permissions('leads.view')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.history(id, user);
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
