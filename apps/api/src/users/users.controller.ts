import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.view')
  list() {
    return this.usersService.list();
  }

  @Get(':id')
  @Permissions('users.view')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Permissions('users.create')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.usersService.create(dto, user.id, this.getRequestContext(request));
  }

  @Patch(':id')
  @Permissions('users.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.usersService.update(id, dto, user.id, this.getRequestContext(request));
  }

  @Delete(':id')
  @Permissions('users.delete')
  softDelete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.usersService.softDelete(id, user.id, this.getRequestContext(request));
  }

  @Patch(':id/block')
  @Permissions('users.block')
  block(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.usersService.block(id, user.id, this.getRequestContext(request));
  }

  @Patch(':id/unblock')
  @Permissions('users.block')
  unblock(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.usersService.unblock(id, user.id, this.getRequestContext(request));
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
