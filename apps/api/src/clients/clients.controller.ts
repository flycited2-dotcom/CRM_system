import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { ClientQueryDto } from './dto/client-query.dto';
import { CreateClientCommentDto } from './dto/create-client-comment.dto';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientsService, type UploadedClientFile } from './clients.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions('clients.view')
  list(@Query() query: ClientQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.list(query, user);
  }

  @Get(':id')
  @Permissions('clients.view')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findById(id, user);
  }

  @Post()
  @Permissions('clients.create')
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.create(dto, user, this.getRequestContext(request));
  }

  @Patch(':id')
  @Permissions('clients.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.update(id, dto, user, this.getRequestContext(request));
  }

  @Delete(':id')
  @Permissions('clients.delete')
  softDelete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.softDelete(id, user, this.getRequestContext(request));
  }

  @Post(':id/contacts')
  @Permissions('clients.update')
  addContact(
    @Param('id') id: string,
    @Body() dto: CreateClientContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.addContact(id, dto, user, this.getRequestContext(request));
  }

  @Patch(':id/contacts/:contactId')
  @Permissions('clients.update')
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateClientContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.updateContact(id, contactId, dto, user, this.getRequestContext(request));
  }

  @Delete(':id/contacts/:contactId')
  @Permissions('clients.update')
  deleteContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.deleteContact(id, contactId, user, this.getRequestContext(request));
  }

  @Get(':id/comments')
  @Permissions('clients.view')
  listComments(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.listComments(id, user);
  }

  @Post(':id/comments')
  @Permissions('clients.update')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateClientCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.addComment(id, dto, user, this.getRequestContext(request));
  }

  @Get(':id/files')
  @Permissions('clients.view')
  listFiles(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.listFiles(id, user);
  }

  @Post(':id/files')
  @Permissions('clients.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addFile(
    @Param('id') id: string,
    @UploadedFile() file: UploadedClientFile,
    @Body('comment') comment: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request
  ) {
    return this.clientsService.addFile(id, file, comment, user, this.getRequestContext(request));
  }

  @Get(':id/history')
  @Permissions('clients.view')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.history(id, user);
  }

  @Get(':id/deals')
  @Permissions('clients.view')
  linkedDeals() {
    return this.clientsService.linkedDeals();
  }

  @Get(':id/tasks')
  @Permissions('clients.view')
  linkedTasks() {
    return this.clientsService.linkedTasks();
  }

  @Get(':id/offers')
  @Permissions('clients.view')
  linkedOffers() {
    return this.clientsService.linkedOffers();
  }

  @Get(':id/messages')
  @Permissions('clients.view')
  linkedMessages() {
    return this.clientsService.linkedMessages();
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
