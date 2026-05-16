import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientContactType, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientQueryDto } from './dto/client-query.dto';
import type { CreateClientCommentDto } from './dto/create-client-comment.dto';
import type { CreateClientContactDto } from './dto/create-client-contact.dto';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientContactDto } from './dto/update-client-contact.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

export type UploadedClientFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  filename?: string;
  path?: string;
};

const clientInclude = {
  responsibleUser: {
    select: {
      id: true,
      fullName: true,
      email: true
    }
  },
  contacts: {
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'asc' }
    ]
  }
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService?: ConfigService
  ) {}

  async list(query: ClientQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...this.visibilityWhere(actor)
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.responsibleUserId && this.hasBroadClientAccess(actor)) {
      where.responsibleUserId = query.responsibleUserId;
    }

    if (query.source) {
      where.source = { contains: query.source, mode: 'insensitive' };
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.search) {
      where.OR = this.searchWhere(query.search);
    }

    return this.prisma.client.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: clientInclude
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const client = await this.prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.visibilityWhere(actor)
      },
      include: {
        ...clientInclude,
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        files: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async create(dto: CreateClientDto, actor: AuthenticatedUser, context: RequestContext) {
    const responsibleUserId = this.resolveResponsibleUserId(dto.responsibleUserId, actor);
    const contacts = this.normalizeContacts(dto.contacts ?? []);
    const data: Record<string, unknown> = {
      type: dto.type,
      status: dto.status ?? 'active',
      name: dto.name,
      inn: dto.inn,
      kpp: dto.kpp,
      ogrn: dto.ogrn,
      legalAddress: dto.legalAddress,
      actualAddress: dto.actualAddress,
      city: dto.city,
      source: dto.source,
      responsibleUserId,
      comment: dto.comment,
      createdBy: actor.id,
      updatedBy: actor.id
    };

    if (contacts.length > 0) {
      data.contacts = {
        create: contacts
      };
    }

    const client = await this.prisma.client.create({
      data: data as Prisma.ClientUncheckedCreateInput,
      include: clientInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.create',
      entityType: 'client',
      entityId: client.id,
      newValue: {
        name: client.name,
        type: client.type,
        responsibleUserId: client.responsibleUserId
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return client;
  }

  async update(id: string, dto: UpdateClientDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id, actor);
    const data: Record<string, unknown> = {
      updatedBy: actor.id
    };

    for (const field of [
      'type',
      'status',
      'name',
      'inn',
      'kpp',
      'ogrn',
      'legalAddress',
      'actualAddress',
      'city',
      'source',
      'comment'
    ] as const) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    if (dto.responsibleUserId !== undefined && this.hasBroadClientAccess(actor)) {
      data.responsibleUserId = dto.responsibleUserId;
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: data as Prisma.ClientUncheckedUpdateInput,
      include: clientInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.update',
      entityType: 'client',
      entityId: client.id,
      newValue: {
        name: client.name,
        type: client.type,
        responsibleUserId: client.responsibleUserId
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return client;
  }

  async softDelete(id: string, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id, actor);
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        status: 'archived',
        deletedAt: new Date(),
        updatedBy: actor.id
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.delete',
      entityType: 'client',
      entityId: client.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  async addContact(
    clientId: string,
    dto: CreateClientContactDto,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    await this.findById(clientId, actor);

    if (dto.isPrimary) {
      await this.clearPrimaryContact(clientId, dto.contactType);
    }

    const contact = await this.prisma.clientContact.create({
      data: {
        clientId,
        contactType: dto.contactType,
        value: dto.value,
        isPrimary: dto.isPrimary ?? false,
        comment: dto.comment
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.contact.create',
      entityType: 'client',
      entityId: clientId,
      newValue: {
        contactType: contact.contactType,
        value: contact.value
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return contact;
  }

  async updateContact(
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDto,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    await this.findById(clientId, actor);
    const existing = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId }
    });

    if (!existing) {
      throw new NotFoundException('Client contact not found');
    }

    const contactType = dto.contactType ?? existing.contactType;

    if (dto.isPrimary) {
      await this.clearPrimaryContact(clientId, contactType, contactId);
    }

    const contact = await this.prisma.clientContact.update({
      where: { id: contactId },
      data: {
        contactType: dto.contactType,
        value: dto.value,
        isPrimary: dto.isPrimary,
        comment: dto.comment
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.contact.update',
      entityType: 'client',
      entityId: clientId,
      newValue: {
        contactType: contact.contactType,
        value: contact.value
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return contact;
  }

  async deleteContact(
    clientId: string,
    contactId: string,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    await this.findById(clientId, actor);
    const existing = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId }
    });

    if (!existing) {
      throw new NotFoundException('Client contact not found');
    }

    await this.prisma.clientContact.delete({ where: { id: contactId } });
    await this.auditService.log({
      userId: actor.id,
      action: 'client.contact.delete',
      entityType: 'client',
      entityId: clientId,
      oldValue: {
        contactType: existing.contactType,
        value: existing.value
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  async listComments(clientId: string, actor: AuthenticatedUser) {
    await this.findById(clientId, actor);

    return this.prisma.clientComment.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });
  }

  async addComment(
    clientId: string,
    dto: CreateClientCommentDto,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    await this.findById(clientId, actor);
    const comment = await this.prisma.clientComment.create({
      data: {
        clientId,
        userId: actor.id,
        text: dto.text
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.comment.create',
      entityType: 'client',
      entityId: clientId,
      newValue: { text: dto.text },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return comment;
  }

  async listFiles(clientId: string, actor: AuthenticatedUser) {
    await this.findById(clientId, actor);

    return this.prisma.clientFile.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });
  }

  async addFile(
    clientId: string,
    file: UploadedClientFile | undefined,
    comment: string | undefined,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    if (!file || file.size <= 0) {
      throw new BadRequestException('File is required');
    }

    await this.findById(clientId, actor);
    const stored = await this.storeFile(file);
    const clientFile = await this.prisma.clientFile.create({
      data: {
        clientId,
        uploadedById: actor.id,
        originalName: file.originalname,
        storedName: stored.storedName,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: stored.storagePath,
        comment
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'client.file.create',
      entityType: 'client',
      entityId: clientId,
      newValue: {
        originalName: clientFile.originalName,
        size: clientFile.size
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return clientFile;
  }

  async history(clientId: string, actor: AuthenticatedUser) {
    await this.findById(clientId, actor);

    return this.prisma.activityLog.findMany({
      where: {
        entityType: 'client',
        entityId: clientId
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });
  }

  linkedDeals() {
    return [];
  }

  linkedTasks() {
    return [];
  }

  linkedOffers() {
    return [];
  }

  linkedMessages() {
    return [];
  }

  private hasBroadClientAccess(actor: AuthenticatedUser) {
    return ['owner', 'admin', 'manager_head'].includes(actor.role);
  }

  private visibilityWhere(actor: AuthenticatedUser): Prisma.ClientWhereInput {
    return this.hasBroadClientAccess(actor) ? {} : { responsibleUserId: actor.id };
  }

  private resolveResponsibleUserId(responsibleUserId: string | undefined, actor: AuthenticatedUser) {
    return this.hasBroadClientAccess(actor) ? (responsibleUserId ?? actor.id) : actor.id;
  }

  private searchWhere(search: string): Prisma.ClientWhereInput[] {
    const contains = { contains: search, mode: 'insensitive' as const };

    return [
      { name: contains },
      { inn: contains },
      { kpp: contains },
      { ogrn: contains },
      { city: contains },
      { source: contains },
      {
        contacts: {
          some: {
            value: contains
          }
        }
      }
    ];
  }

  private normalizeContacts(contacts: CreateClientContactDto[]) {
    const seenPrimaryByType = new Set<ClientContactType>();

    return [...contacts].reverse().map((contact) => {
      const isPrimary = Boolean(contact.isPrimary && !seenPrimaryByType.has(contact.contactType));

      if (isPrimary) {
        seenPrimaryByType.add(contact.contactType);
      }

      return {
        contactType: contact.contactType,
        value: contact.value,
        isPrimary,
        comment: contact.comment
      };
    }).reverse();
  }

  private async clearPrimaryContact(
    clientId: string,
    contactType: ClientContactType,
    exceptContactId?: string
  ) {
    await this.prisma.clientContact.updateMany({
      where: {
        clientId,
        contactType,
        ...(exceptContactId ? { id: { not: exceptContactId } } : {})
      },
      data: { isPrimary: false }
    });
  }

  private async storeFile(file: UploadedClientFile) {
    if (file.path && file.filename) {
      return {
        storedName: file.filename,
        storagePath: file.path
      };
    }

    if (!file.buffer) {
      throw new BadRequestException('File buffer is required');
    }

    const uploadDir = this.configService?.get<string>('CLIENT_UPLOAD_DIR') ?? './uploads/clients';
    const safeOriginalName = basename(file.originalname).replace(/[^\w.-]/g, '_');
    const storedName = `${randomUUID()}${extname(safeOriginalName)}`;
    const storagePath = join(uploadDir, storedName);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(storagePath, file.buffer);

    return {
      storedName,
      storagePath
    };
  }
}
