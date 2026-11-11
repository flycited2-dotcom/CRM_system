import { Injectable, NotFoundException } from '@nestjs/common';
import { Integration, Prisma, TenderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangeTenderStatusDto } from './dto/change-tender-status.dto';
import type { CreateTenderDto } from './dto/create-tender.dto';
import type { TenderQueryDto } from './dto/tender-query.dto';
import type { UpdateTenderDto } from './dto/update-tender.dto';
import { definedFields, parseImportedTender, type ImportedTender } from './tender-import';

const SOON_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 100;

// Statuses after which the tender no longer needs attention.
const FINISHED_STATUSES: TenderStatus[] = [
  TenderStatus.closing,
  TenderStatus.lost,
  TenderStatus.declined
];

const tenderInclude = {
  responsibleUser: {
    select: {
      id: true,
      fullName: true,
      email: true
    }
  }
} satisfies Prisma.TenderInclude;

export type TenderImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ index: number; message: string }>;
};

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async list(query: TenderQueryDto) {
    const now = new Date();
    const conditions: Prisma.TenderWhereInput[] = [{ deletedAt: null }];

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.priority) {
      conditions.push({ priority: query.priority });
    }

    if (query.responsibleUserId) {
      conditions.push({ responsibleUserId: query.responsibleUserId });
    }

    if (query.deadline === 'soon') {
      conditions.push({
        submissionDeadline: { gte: now, lte: new Date(now.getTime() + SOON_MS) },
        status: { notIn: FINISHED_STATUSES }
      });
    } else if (query.deadline === 'expired') {
      conditions.push({ submissionDeadline: { lt: now } });
    }

    if (query.onlyActual) {
      conditions.push({
        OR: [
          { submissionDeadline: null },
          { submissionDeadline: { gte: now } },
          { status: { not: TenderStatus.found } }
        ]
      });
    }

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };

      conditions.push({
        OR: [
          { title: contains },
          { tenderNumber: contains },
          { officialNumber: contains },
          { customerName: contains },
          { region: contains }
        ]
      });
    }

    const where: Prisma.TenderWhereInput = { AND: conditions };
    const [items, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        orderBy: [{ submissionDeadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: query.take ?? DEFAULT_PAGE_SIZE,
        skip: query.skip ?? 0,
        include: tenderInclude
      }),
      this.prisma.tender.count({ where })
    ]);

    return { items, total };
  }

  /** Counters for the dashboard: what needs attention right now. */
  async summary() {
    const now = new Date();
    const open: Prisma.TenderWhereInput = {
      deletedAt: null,
      status: { notIn: FINISHED_STATUSES }
    };
    const actual: Prisma.TenderWhereInput = {
      ...open,
      OR: [
        { submissionDeadline: null },
        { submissionDeadline: { gte: now } },
        { status: { not: TenderStatus.found } }
      ]
    };

    const [active, hot, closingSoon, unassigned, inWork] = await Promise.all([
      this.prisma.tender.count({ where: actual }),
      this.prisma.tender.count({ where: { ...actual, priority: 'hot' } }),
      this.prisma.tender.count({
        where: {
          ...open,
          submissionDeadline: { gte: now, lte: new Date(now.getTime() + SOON_MS) }
        }
      }),
      this.prisma.tender.count({ where: { ...actual, responsibleUserId: null } }),
      this.prisma.tender.count({ where: { ...open, status: { not: TenderStatus.found } } })
    ]);

    return { active, hot, closingSoon, unassigned, inWork };
  }

  async findById(id: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id, deletedAt: null },
      include: tenderInclude
    });

    if (!tender) {
      throw new NotFoundException('Tender not found');
    }

    return tender;
  }

  async create(dto: CreateTenderDto, actor: AuthenticatedUser, context: RequestContext) {
    const tender = await this.prisma.tender.create({
      data: {
        ...this.toTenderData(dto),
        title: dto.title,
        source: 'manual',
        createdBy: actor.id,
        updatedBy: actor.id
      },
      include: tenderInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'tender.create',
      entityType: 'tender',
      entityId: tender.id,
      newValue: { title: tender.title, tenderNumber: tender.tenderNumber },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return tender;
  }

  async update(id: string, dto: UpdateTenderDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id);

    const data = { ...this.toTenderData(dto), updatedBy: actor.id };
    const tender = await this.prisma.tender.update({
      where: { id },
      data,
      include: tenderInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'tender.update',
      entityType: 'tender',
      entityId: id,
      newValue: this.toAuditValue(dto),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return tender;
  }

  async changeStatus(
    id: string,
    dto: ChangeTenderStatusDto,
    actor: AuthenticatedUser,
    context: RequestContext
  ) {
    const current = await this.findById(id);
    const tender = await this.prisma.tender.update({
      where: { id },
      data: {
        status: dto.status,
        result: dto.result,
        updatedBy: actor.id
      },
      include: tenderInclude
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'tender.status',
      entityType: 'tender',
      entityId: id,
      oldValue: { status: current.status },
      newValue: { status: dto.status, result: dto.result ?? null },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return tender;
  }

  async softDelete(id: string, actor: AuthenticatedUser, context: RequestContext) {
    await this.findById(id);
    await this.prisma.tender.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.id }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'tender.delete',
      entityType: 'tender',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  async history(id: string) {
    await this.findById(id);

    return this.prisma.activityLog.findMany({
      where: { entityType: 'tender', entityId: id },
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

  /**
   * Stores a feed of tenders from an external system.
   *
   * A tender is matched by its source key, or by the official procurement number
   * when the same tender arrives through another aggregator. New ones are created
   * in the "found" status. Existing ones get their source-owned fields refreshed;
   * everything people set in the CRM (status, responsible, comment, margin) is
   * left untouched. A tender deleted in the CRM stays deleted.
   */
  async importFromIntegration(
    integration: Integration,
    items: unknown[],
    defaultOffset: string
  ): Promise<TenderImportResult> {
    const result: TenderImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    const parsed = new Map<string, ImportedTender>();

    items.forEach((item, index) => {
      const outcome = parseImportedTender(item, defaultOffset);

      if (outcome.ok) {
        // The same tender twice in one feed: the later entry wins.
        parsed.set(outcome.tender.externalKey, outcome.tender);
      } else {
        result.errors.push({ index, message: outcome.message });
      }
    });

    if (parsed.size === 0) {
      return result;
    }

    const tenders = [...parsed.values()];
    const officialNumbers = tenders
      .map((tender) => tender.officialNumber)
      .filter((value): value is string => Boolean(value));
    const existing = await this.prisma.tender.findMany({
      where: {
        OR: [
          { externalKey: { in: tenders.map((tender) => tender.externalKey) } },
          ...(officialNumbers.length > 0 ? [{ officialNumber: { in: officialNumbers } }] : [])
        ]
      },
      select: { id: true, externalKey: true, officialNumber: true, deletedAt: true }
    });
    const byKey = new Map(existing.map((row) => [row.externalKey, row]));
    const byOfficialNumber = new Map(
      existing.filter((row) => row.officialNumber).map((row) => [row.officialNumber, row])
    );

    const now = new Date();
    const toCreate: Prisma.TenderCreateManyInput[] = [];

    for (const tender of tenders) {
      const match =
        byKey.get(tender.externalKey) ??
        (tender.officialNumber ? byOfficialNumber.get(tender.officialNumber) : undefined);

      if (!match) {
        const id = randomUUID();

        toCreate.push({
          id,
          ...(definedFields(tender) as Omit<Prisma.TenderCreateManyInput, 'title'>),
          title: tender.title,
          externalKey: tender.externalKey,
          source: integration.code,
          integrationId: integration.id,
          firstSeenAt: now,
          lastSeenAt: now
        });

        // A second aggregator card of the same tender later in this feed must
        // match the one being created, not create another.
        if (tender.officialNumber) {
          byOfficialNumber.set(tender.officialNumber, {
            id,
            externalKey: tender.externalKey,
            officialNumber: tender.officialNumber,
            deletedAt: null
          });
        }

        continue;
      }

      if (match.deletedAt) {
        result.skipped += 1;
        continue;
      }

      // Created earlier in this same feed: nothing to refresh yet.
      if (toCreate.some((row) => row.id === match.id)) {
        result.skipped += 1;
        continue;
      }

      await this.prisma.tender.update({
        where: { id: match.id },
        data: { ...definedFields(tender), lastSeenAt: now }
      });
      result.updated += 1;
    }

    if (toCreate.length > 0) {
      await this.prisma.tender.createMany({ data: toCreate });
      await this.prisma.activityLog.createMany({
        data: toCreate.map((row) => ({
          action: 'tender.import',
          entityType: 'tender',
          entityId: row.id,
          newValue: { integration: integration.code, externalKey: row.externalKey }
        }))
      });
      result.created = toCreate.length;
    }

    return result;
  }

  private toTenderData(dto: CreateTenderDto | UpdateTenderDto) {
    const data: Prisma.TenderUncheckedUpdateInput = {};

    for (const field of [
      'title',
      'tenderNumber',
      'platform',
      'url',
      'customerName',
      'region',
      'nmck',
      'procurementLaw',
      'category',
      'responsibleUserId',
      'requirements',
      'comment',
      'result',
      'margin'
    ] as const) {
      const value = (dto as UpdateTenderDto)[field];

      if (value !== undefined) {
        data[field] = value;
      }
    }

    for (const field of ['publishDate', 'submissionDeadline', 'auctionDate'] as const) {
      const value = dto[field];

      if (value !== undefined) {
        data[field] = new Date(value);
      }
    }

    return data as Prisma.TenderUncheckedCreateInput;
  }

  private toAuditValue(dto: UpdateTenderDto): Prisma.InputJsonObject {
    return Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined)
    ) as Prisma.InputJsonObject;
  }
}
