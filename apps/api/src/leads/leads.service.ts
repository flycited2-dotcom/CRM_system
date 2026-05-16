import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException
} from '@nestjs/common';
import { ClientContactType, LeadStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignLeadDto } from './dto/assign-lead.dto';
import type { CloseLeadDto } from './dto/close-lead.dto';
import type { ConvertLeadDto } from './dto/convert-lead.dto';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { LeadQueryDto } from './dto/lead-query.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';

const leadInclude = {
  responsibleUser: {
    select: {
      id: true,
      fullName: true,
      email: true
    }
  },
  client: {
    select: {
      id: true,
      name: true,
      type: true,
      status: true
    }
  }
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async list(query: LeadQueryDto, actor: AuthenticatedUser) {
    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...this.visibilityWhere(actor)
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.responsibleUserId && this.hasBroadLeadAccess(actor)) {
      where.responsibleUserId = query.responsibleUserId;
    }

    if (query.source) {
      where.source = { contains: query.source, mode: 'insensitive' };
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.overdue) {
      where.receivedAt = { lte: this.overdueThreshold() };
      where.firstResponseAt = null;
      where.status = { in: [LeadStatus.new, LeadStatus.assigned] };
    }

    if (query.search) {
      const search = this.searchWhere(query.search);
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: search }];
        delete where.OR;
      } else {
        where.OR = search;
      }
    }

    return this.prisma.lead.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      include: leadInclude
    });
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.visibilityWhere(actor)
      },
      include: leadInclude
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async create(dto: CreateLeadDto, actor: AuthenticatedUser, context: RequestContext) {
    const responsibleUserId = this.resolveResponsibleUserId(dto.responsibleUserId, actor);
    const status = dto.status ?? (responsibleUserId ? LeadStatus.assigned : LeadStatus.new);
    const lead = await this.prisma.lead.create({
      data: {
        ...this.pickLeadFields(dto),
        status,
        responsibleUserId,
        createdBy: actor.id,
        updatedBy: actor.id
      },
      include: leadInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'lead.create',
      entityType: 'lead',
      entityId: lead.id,
      newValue: {
        status: lead.status,
        responsibleUserId: lead.responsibleUserId,
        source: lead.source
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id, actor);
    const data: Prisma.LeadUncheckedUpdateInput = {
      ...this.pickLeadFields(dto),
      updatedBy: actor.id
    };

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (dto.responsibleUserId !== undefined && this.hasBroadLeadAccess(actor)) {
      data.responsibleUserId = dto.responsibleUserId;
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data,
      include: leadInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'lead.update',
      entityType: 'lead',
      entityId: lead.id,
      newValue: data as Prisma.InputJsonValue,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return lead;
  }

  async assign(id: string, dto: AssignLeadDto, actor: AuthenticatedUser, context: RequestContext) {
    const lead = await this.findById(id, actor);
    const responseAt = lead.firstResponseAt ?? new Date(Date.now());
    const status = lead.status === LeadStatus.in_progress ? LeadStatus.in_progress : LeadStatus.assigned;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        responsibleUserId: dto.responsibleUserId,
        status,
        firstResponseAt: responseAt,
        updatedBy: actor.id
      },
      include: leadInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'lead.assign',
      entityType: 'lead',
      entityId: id,
      newValue: {
        responsibleUserId: dto.responsibleUserId,
        firstResponseAt: responseAt.toISOString()
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return updated;
  }

  async close(id: string, dto: CloseLeadDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id, actor);
    const closedAt = new Date(Date.now());
    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        status: LeadStatus.closed,
        closedAt,
        closeReason: dto.closeReason,
        updatedBy: actor.id
      },
      include: leadInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'lead.close',
      entityType: 'lead',
      entityId: id,
      newValue: {
        closeReason: dto.closeReason
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return lead;
  }

  async convertToClient(
    id: string,
    dto: ConvertLeadDto,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    const lead = await this.findById(id, actor);
    const convertedAt = new Date(Date.now());

    return this.prisma.$transaction(async (tx) => {
      const client = dto.clientId
        ? await this.findClientForConversion(tx, dto.clientId, actor)
        : await this.createClientFromLead(tx, lead, actor);

      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: LeadStatus.converted,
          clientId: client.id,
          firstResponseAt: lead.firstResponseAt ?? convertedAt,
          closedAt: convertedAt,
          updatedBy: actor.id
        },
        include: leadInclude
      });

      await this.auditService.log({
        userId: actor.id,
        action: 'lead.convert_to_client',
        entityType: 'lead',
        entityId: id,
        newValue: {
          clientId: client.id
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });

      return updated;
    });
  }

  async convertToDeal() {
    throw new NotImplementedException('Deal conversion will be available after the deals module is implemented');
  }

  async history(id: string, actor: AuthenticatedUser) {
    await this.findById(id, actor);

    return this.prisma.activityLog.findMany({
      where: {
        entityType: 'lead',
        entityId: id
      },
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

  private async createClientFromLead(
    tx: Prisma.TransactionClient,
    lead: Awaited<ReturnType<LeadsService['findById']>>,
    actor: AuthenticatedUser
  ) {
    const name = lead.name ?? lead.phone ?? lead.email ?? lead.telegram;

    if (!name) {
      throw new BadRequestException('Lead has no data for client conversion');
    }

    const responsibleUserId = lead.responsibleUserId ?? actor.id;
    const client = await tx.client.create({
      data: {
        type: 'individual',
        status: 'active',
        name,
        city: lead.city,
        source: lead.source,
        responsibleUserId,
        comment: lead.message,
        createdBy: actor.id,
        updatedBy: actor.id
      }
    });
    const contacts = [
      this.contactFromLead(client.id, ClientContactType.phone, lead.phone),
      this.contactFromLead(client.id, ClientContactType.email, lead.email),
      this.contactFromLead(client.id, ClientContactType.telegram, lead.telegram)
    ].filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));

    if (contacts.length > 0) {
      await tx.clientContact.createMany({ data: contacts });
    }

    return client;
  }

  private async findClientForConversion(
    tx: Prisma.TransactionClient,
    clientId: string,
    actor: AuthenticatedUser
  ) {
    const client = await tx.client.findFirst({
      where: {
        id: clientId,
        deletedAt: null,
        ...(this.hasBroadLeadAccess(actor) ? {} : { responsibleUserId: actor.id })
      }
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  private contactFromLead(clientId: string, contactType: ClientContactType, value?: string | null) {
    if (!value) {
      return null;
    }

    return {
      clientId,
      contactType,
      value,
      isPrimary: true
    };
  }

  private pickLeadFields(dto: CreateLeadDto | UpdateLeadDto) {
    const data: Record<string, unknown> = {};

    for (const field of [
      'source',
      'site',
      'pageUrl',
      'utmSource',
      'utmMedium',
      'utmCampaign',
      'utmContent',
      'utmTerm',
      'name',
      'phone',
      'email',
      'telegram',
      'message',
      'productInterest',
      'city',
      'ipAddress'
    ] as const) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    return data;
  }

  private searchWhere(search: string): Prisma.LeadWhereInput[] {
    return [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { telegram: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { source: { contains: search, mode: 'insensitive' } },
      { site: { contains: search, mode: 'insensitive' } },
      { productInterest: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } }
    ];
  }

  private visibilityWhere(actor: AuthenticatedUser): Prisma.LeadWhereInput {
    return this.hasBroadLeadAccess(actor)
      ? {}
      : {
          OR: [
            { responsibleUserId: actor.id },
            { createdBy: actor.id }
          ]
        };
  }

  private hasBroadLeadAccess(actor: AuthenticatedUser) {
    return ['owner', 'admin', 'manager_head'].includes(actor.role);
  }

  private resolveResponsibleUserId(responsibleUserId: string | undefined, actor: AuthenticatedUser) {
    if (this.hasBroadLeadAccess(actor)) {
      return responsibleUserId;
    }

    return responsibleUserId ?? actor.id;
  }

  private overdueThreshold() {
    return new Date(Date.now() - 15 * 60 * 1000);
  }
}
