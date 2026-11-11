import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Integration, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TendersService } from '../tenders/tenders.service';
import { IntegrationsService } from './integrations.service';
import {
  dateTime,
  isRecord,
  normalizeEmail,
  normalizePhone,
  pickText,
  text,
  type RawRecord
} from './normalize';

const MAX_TENDERS_PER_REQUEST = 1000;

@Injectable()
export class IntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationsService: IntegrationsService,
    private readonly tendersService: TendersService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Creates a lead from an external system.
   * Repeating a request with the same `externalId` returns the lead created the
   * first time instead of creating another one.
   */
  async createLead(integration: Integration, body: unknown) {
    if (!isRecord(body)) {
      await this.logError(integration, 'lead.create', 'Request body must be a JSON object');
      throw new BadRequestException('Request body must be a JSON object');
    }

    const utm = isRecord(body.utm) ? body.utm : {};
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);
    const telegram = text(body.telegram, 100);
    const name = text(body.name, 200);
    const message = text(body.message, 5000);
    const externalId = pickText(body, ['externalId', 'external_id', 'id'], 200);

    if (!phone && !email && !telegram && !name && !message) {
      const reason = 'Lead needs at least one of: phone, email, telegram, name, message';
      await this.logError(integration, 'lead.create', reason, this.summarizeLead(body));
      throw new BadRequestException(reason);
    }

    if (externalId) {
      const existing = await this.prisma.lead.findFirst({
        where: { integrationId: integration.id, externalId },
        select: { id: true }
      });

      if (existing) {
        await this.integrationsService.writeLog({
          integrationId: integration.id,
          operation: 'lead.create',
          status: 'duplicate',
          request: { externalId },
          response: { leadId: existing.id }
        });

        return { success: true, leadId: existing.id, created: false };
      }
    }

    const duplicateOf = await this.findEarlierLead(phone, email);
    const data: Prisma.LeadUncheckedCreateInput = {
      source: integration.code,
      site: pickText(body, ['site'], 200),
      pageUrl: pickText(body, ['pageUrl', 'page_url', 'page'], 1000),
      utmSource: pickText(utm, ['source'], 200) ?? pickText(body, ['utmSource', 'utm_source'], 200),
      utmMedium: pickText(utm, ['medium'], 200) ?? pickText(body, ['utmMedium', 'utm_medium'], 200),
      utmCampaign:
        pickText(utm, ['campaign'], 200) ?? pickText(body, ['utmCampaign', 'utm_campaign'], 200),
      utmContent:
        pickText(utm, ['content'], 200) ?? pickText(body, ['utmContent', 'utm_content'], 200),
      utmTerm: pickText(utm, ['term'], 200) ?? pickText(body, ['utmTerm', 'utm_term'], 200),
      name,
      phone,
      email,
      telegram,
      message,
      productInterest: pickText(body, ['productInterest', 'product_interest', 'product'], 500),
      city: pickText(body, ['city'], 120),
      ipAddress: pickText(body, ['ip', 'ipAddress', 'ip_address'], 64),
      receivedAt: dateTime(body.receivedAt ?? body.received_at, this.defaultOffset()),
      integrationId: integration.id,
      externalId,
      duplicateOfId: duplicateOf?.id
    };

    let lead: { id: string };

    try {
      lead = await this.prisma.lead.create({ data, select: { id: true } });
    } catch (error) {
      // Two deliveries of the same request racing each other: the unique
      // (integration, externalId) pair lets only one through.
      if (externalId && (error as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.lead.findFirst({
          where: { integrationId: integration.id, externalId },
          select: { id: true }
        });

        if (existing) {
          return { success: true, leadId: existing.id, created: false };
        }
      }

      await this.logError(integration, 'lead.create', 'Failed to store the lead', this.summarizeLead(body));
      throw error;
    }

    await this.auditService.log({
      action: 'lead.intake',
      entityType: 'lead',
      entityId: lead.id,
      newValue: {
        integration: integration.code,
        externalId: externalId ?? null,
        duplicateOfId: duplicateOf?.id ?? null
      }
    });
    await this.integrationsService.writeLog({
      integrationId: integration.id,
      operation: 'lead.create',
      status: 'success',
      request: this.summarizeLead(body),
      response: { leadId: lead.id, duplicateOfId: duplicateOf?.id ?? null }
    });

    return {
      success: true,
      leadId: lead.id,
      created: true,
      duplicateOfId: duplicateOf?.id ?? null
    };
  }

  async importTenders(integration: Integration, body: unknown) {
    const items = Array.isArray(body) ? body : isRecord(body) ? body.items : undefined;

    if (!Array.isArray(items)) {
      await this.logError(integration, 'tender.import', 'Expected {"items": [...]}');
      throw new BadRequestException('Expected {"items": [...]}');
    }

    if (items.length > MAX_TENDERS_PER_REQUEST) {
      const reason = `At most ${MAX_TENDERS_PER_REQUEST} tenders per request`;
      await this.logError(integration, 'tender.import', reason, { received: items.length });
      throw new BadRequestException(reason);
    }

    const result = await this.tendersService.importFromIntegration(
      integration,
      items,
      this.defaultOffset()
    );

    await this.integrationsService.writeLog({
      integrationId: integration.id,
      operation: 'tender.import',
      status: result.errors.length === 0 ? 'success' : result.errors.length === items.length ? 'error' : 'partial',
      request: { received: items.length },
      response: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.slice(0, 20)
      },
      errorMessage: result.errors.length > 0 ? `${result.errors.length} item(s) rejected` : undefined
    });

    return { success: true, received: items.length, ...result };
  }

  /** Most recent lead with the same phone or email: the new one is flagged as its duplicate. */
  private async findEarlierLead(phone?: string, email?: string) {
    const conditions: Prisma.LeadWhereInput[] = [];

    if (phone) {
      conditions.push({ phone });
    }

    if (email) {
      conditions.push({ email: { equals: email, mode: 'insensitive' } });
    }

    if (conditions.length === 0) {
      return null;
    }

    return this.prisma.lead.findFirst({
      where: { deletedAt: null, OR: conditions },
      orderBy: { receivedAt: 'desc' },
      select: { id: true }
    });
  }

  // Contact details stay in the lead itself; the integration log keeps only
  // what is needed to trace a delivery.
  private summarizeLead(body: RawRecord): Prisma.InputJsonObject {
    return {
      externalId: pickText(body, ['externalId', 'external_id', 'id'], 200) ?? null,
      site: pickText(body, ['site'], 200) ?? null,
      hasPhone: Boolean(body.phone),
      hasEmail: Boolean(body.email)
    };
  }

  private async logError(
    integration: Integration,
    operation: string,
    message: string,
    request?: Prisma.InputJsonValue
  ) {
    await this.integrationsService.writeLog({
      integrationId: integration.id,
      operation,
      status: 'error',
      request,
      errorMessage: message
    });
  }

  private defaultOffset() {
    const configured = this.configService.get<string>('INTAKE_DEFAULT_UTC_OFFSET') ?? '+03:00';

    return /^[+-]\d{2}:\d{2}$/.test(configured) ? configured : '+03:00';
  }
}
