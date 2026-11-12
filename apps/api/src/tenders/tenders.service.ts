import { Injectable, NotFoundException } from '@nestjs/common';
import { Integration, IntegrationType, Prisma, TenderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangeTenderStatusDto } from './dto/change-tender-status.dto';
import type { CreateTenderDto } from './dto/create-tender.dto';
import type { TenderQueryDto } from './dto/tender-query.dto';
import type { UpdateTenderDto } from './dto/update-tender.dto';
import {
  definedFields,
  looksLikeOfficialNumber,
  parseImportedTender,
  type ImportedTender,
  type ImportedTenderWork
} from './tender-import';

const SOON_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 100;

// Statuses after which the tender no longer needs attention.
const FINISHED_STATUSES: TenderStatus[] = [
  TenderStatus.closing,
  TenderStatus.lost,
  TenderStatus.declined,
  TenderStatus.not_held,
  TenderStatus.missed
];

// A work journal matches tenders by number alone; shorter numbers are too likely
// to coincide between trading platforms.
const MIN_JOURNAL_NUMBER_LENGTH = 6;

// What an import needs to know about a tender that is already stored.
const importMatchSelect = {
  id: true,
  externalKey: true,
  deletedAt: true,
  integrationId: true,
  status: true,
  comment: true,
  takenAt: true,
  journalJson: true,
  title: true,
  tenderNumber: true,
  platform: true,
  url: true,
  customerName: true,
  region: true,
  nmck: true,
  publishDate: true,
  submissionDeadline: true,
  auctionDate: true,
  procurementLaw: true,
  procedureType: true,
  category: true,
  priority: true,
  officialNumber: true,
  officialUrl: true,
  documentsUrl: true
} satisfies Prisma.TenderSelect;

type StoredTender = Prisma.TenderGetPayload<{ select: typeof importMatchSelect }>;
type ImportEntry = { tender: ImportedTender; work: ImportedTenderWork; sourceNumber?: string };

function isBlank(value: unknown) {
  return value === null || value === undefined || value === '';
}

function sameValue(incoming: unknown, stored: unknown) {
  if (incoming instanceof Date) {
    return stored instanceof Date && stored.getTime() === incoming.getTime();
  }

  if (typeof incoming === 'number') {
    // Decimal columns come back as Prisma.Decimal.
    return !isBlank(stored) && Number(stored) === incoming;
  }

  return incoming === stored;
}

function definedOnly(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/** The work fields exactly as a journal sent them, in a form that can be stored and compared. */
function journalSnapshot(work: ImportedTenderWork): Record<string, string> {
  return Object.fromEntries(
    Object.entries(definedOnly(work)).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : String(value)
    ])
  );
}

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
        // The first move out of "found" is the moment the tender was taken into work.
        ...(current.status === TenderStatus.found &&
        dto.status !== TenderStatus.found &&
        !current.takenAt
          ? { takenAt: new Date() }
          : {}),
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
   *
   * An integration of the `tender_tracker` type is a work journal: its entries
   * also carry the status, comment and dates the team set (see applyJournalEntry).
   */
  async importFromIntegration(
    integration: Integration,
    items: unknown[],
    defaultOffset: string
  ): Promise<TenderImportResult> {
    const result: TenderImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    // A work journal reports what the team decided; any other feed only describes tenders.
    const managesWork = integration.type === IntegrationType.tender_tracker;
    const parsed = new Map<string, ImportEntry>();

    items.forEach((item, index) => {
      const outcome = parseImportedTender(item, defaultOffset);

      if (!outcome.ok) {
        result.errors.push({ index, message: outcome.message });
        return;
      }

      const { tender, work, sourceNumber } = outcome;

      // The journal knows one number per tender. Marking a registry number as such
      // lets the finder feed recognise the same procurement later.
      if (managesWork && !tender.officialNumber && looksLikeOfficialNumber(sourceNumber)) {
        tender.officialNumber = sourceNumber;
      }

      // A finder feed is named after the platform it reads; a journal is not a platform.
      if (managesWork && tender.platform === tender.payloadJson.source) {
        tender.platform = undefined;
      }

      // The same tender twice in one feed: the later entry wins.
      parsed.set(tender.externalKey, { tender, work, sourceNumber });
    });

    if (parsed.size === 0) {
      return result;
    }

    const entries = [...parsed.values()];
    const journalNumberOf = (entry: ImportEntry) =>
      managesWork &&
      entry.sourceNumber &&
      entry.sourceNumber.length >= MIN_JOURNAL_NUMBER_LENGTH
        ? entry.sourceNumber
        : undefined;
    const officialNumbers = entries
      .map((entry) => entry.tender.officialNumber)
      .filter((value): value is string => Boolean(value));
    const journalNumbers = entries
      .map(journalNumberOf)
      .filter((value): value is string => Boolean(value));
    const existing = await this.prisma.tender.findMany({
      where: {
        OR: [
          { externalKey: { in: entries.map((entry) => entry.tender.externalKey) } },
          ...(officialNumbers.length > 0 ? [{ officialNumber: { in: officialNumbers } }] : []),
          // The journal's number may be the registry number or the platform's own.
          ...(journalNumbers.length > 0
            ? [
                { officialNumber: { in: journalNumbers } },
                { tenderNumber: { in: journalNumbers } }
              ]
            : [])
        ]
      },
      select: importMatchSelect
    });
    const byKey = new Map(existing.map((row) => [row.externalKey, row]));
    const byOfficialNumber = new Map(
      existing.filter((row) => row.officialNumber).map((row) => [row.officialNumber, row])
    );
    const byTenderNumber = new Map(
      existing.filter((row) => row.tenderNumber).map((row) => [row.tenderNumber, row])
    );

    const now = new Date();
    const toCreate: Prisma.TenderCreateManyInput[] = [];
    const historyRows: Prisma.ActivityLogCreateManyInput[] = [];
    // Official numbers of the tenders being created from this same feed.
    const createdInFeed = new Set<string>();

    for (const entry of entries) {
      const { tender, work } = entry;
      const journalNumber = journalNumberOf(entry);
      const match =
        byKey.get(tender.externalKey) ??
        (tender.officialNumber ? byOfficialNumber.get(tender.officialNumber) : undefined) ??
        (journalNumber
          ? (byOfficialNumber.get(journalNumber) ?? byTenderNumber.get(journalNumber))
          : undefined);

      if (!match) {
        // A second aggregator card of the same tender later in this feed must
        // not create another tender.
        if (tender.officialNumber && createdInFeed.has(tender.officialNumber)) {
          result.skipped += 1;
          continue;
        }

        const id = randomUUID();

        toCreate.push({
          id,
          ...(definedFields(tender) as Omit<Prisma.TenderCreateManyInput, 'title'>),
          ...(managesWork ? { ...definedOnly(work), journalJson: journalSnapshot(work) } : {}),
          title: tender.title,
          externalKey: tender.externalKey,
          source: integration.code,
          integrationId: integration.id,
          firstSeenAt: now,
          lastSeenAt: now
        });
        historyRows.push({
          action: 'tender.import',
          entityType: 'tender',
          entityId: id,
          newValueJson: {
            integration: integration.code,
            externalKey: tender.externalKey,
            ...(managesWork && work.status ? { status: work.status } : {})
          }
        });

        if (tender.officialNumber) {
          createdInFeed.add(tender.officialNumber);
        }

        continue;
      }

      if (match.deletedAt) {
        result.skipped += 1;
        continue;
      }

      if (managesWork) {
        result[await this.applyJournalEntry(integration, match, tender, work, now)] += 1;
        continue;
      }

      await this.prisma.tender.update({
        where: { id: match.id },
        data: { ...definedFields(tender), lastSeenAt: now }
      });
      result.updated += 1;
    }

    if (toCreate.length > 0) {
      // One transaction: a tender must never appear without its origin record.
      await this.prisma.$transaction([
        this.prisma.tender.createMany({ data: toCreate }),
        this.prisma.activityLog.createMany({ data: historyRows })
      ]);
      result.created = toCreate.length;
    }

    return result;
  }

  /**
   * Applies a work-journal entry to a stored tender.
   *
   * The journal reports the work fields (status, comment, date taken, auction
   * date); each is applied when the journal changed it since its previous
   * delivery, so an edit made in the CRM survives until then. The descriptive
   * fields are refreshed only for tenders the journal created itself; for a
   * tender that came from a finder feed it fills the blanks and leaves the rest
   * to that feed. Nothing is written when nothing changed, so resending the whole
   * journal on a schedule does not touch the tenders.
   */
  private async applyJournalEntry(
    integration: Integration,
    match: StoredTender,
    tender: ImportedTender,
    work: ImportedTenderWork,
    now: Date
  ): Promise<'updated' | 'skipped'> {
    const stored = match as Record<string, unknown>;
    const ownsTender = match.integrationId === integration.id;
    const { payloadJson, ...described } = definedFields(tender);
    const sent = journalSnapshot(work);
    const lastSent = (match.journalJson ?? {}) as Record<string, unknown>;
    const candidate: Record<string, unknown> = {};

    // A work field is applied only when the journal itself changed it since the
    // previous delivery. Otherwise what was set in the CRM meanwhile would be
    // undone by every resend.
    for (const [key, value] of Object.entries(definedOnly(work))) {
      if (sent[key] !== lastSent[key]) {
        candidate[key] = value;
      }
    }

    for (const [key, value] of Object.entries(described)) {
      // The auction date is a work field here: the description must not bring it back.
      if (!(key in sent) && (ownsTender || isBlank(stored[key]))) {
        candidate[key] = value;
      }
    }

    const changes = Object.fromEntries(
      Object.entries(candidate).filter(([key, value]) => !sameValue(value, stored[key]))
    );
    const journalChanged = Object.keys({ ...sent, ...lastSent }).some(
      (key) => sent[key] !== lastSent[key]
    );

    if (Object.keys(changes).length === 0 && !journalChanged) {
      return 'skipped';
    }

    const update = this.prisma.tender.update({
      where: { id: match.id },
      data: {
        ...changes,
        journalJson: sent,
        ...(ownsTender ? { payloadJson: payloadJson as Prisma.InputJsonObject, lastSeenAt: now } : {})
      }
    });

    if (!('status' in changes)) {
      await update;
      return 'updated';
    }

    // One transaction: a status must never change without a history record.
    await this.prisma.$transaction([
      update,
      this.prisma.activityLog.create({
        data: {
          action: 'tender.status',
          entityType: 'tender',
          entityId: match.id,
          oldValueJson: { status: match.status },
          newValueJson: { status: work.status, integration: integration.code }
        }
      })
    ]);

    return 'updated';
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
