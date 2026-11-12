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
import { ChangeTenderStatusDto } from './dto/change-tender-status.dto';
import { CreateTenderDto } from './dto/create-tender.dto';
import { TenderQueryDto } from './dto/tender-query.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { TendersService } from './tenders.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  @Permissions('tenders.view')
  list(@Query() query: TenderQueryDto) {
    return this.tendersService.list(query);
  }

  @Get('summary')
  @Permissions('tenders.view')
  summary() {
    return this.tendersService.summary();
  }

  @Get(':id')
  @Permissions('tenders.view')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tendersService.findById(id);
  }

  @Post()
  @Permissions('tenders.create')
  create(
    @Body() dto: CreateTenderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.tendersService.create(dto, user, this.getRequestContext(request));
  }

  @Patch(':id')
  @Permissions('tenders.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.tendersService.update(id, dto, user, this.getRequestContext(request));
  }

  @Post(':id/change-status')
  @Permissions('tenders.update')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTenderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.tendersService.changeStatus(id, dto, user, this.getRequestContext(request));
  }

  @Delete(':id')
  @Permissions('tenders.delete')
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.tendersService.softDelete(id, user, this.getRequestContext(request));
  }

  @Get(':id/history')
  @Permissions('tenders.view')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.tendersService.history(id);
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
