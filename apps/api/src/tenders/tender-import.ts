import type { Prisma } from '@prisma/client';
import { amount, dateTime, isRecord, pickText, text } from '../integrations/normalize';

/** Fields a source system owns: refreshed on every import, never edited by hand in the CRM. */
export type ImportedTender = {
  externalKey: string;
  title: string;
  tenderNumber?: string;
  platform?: string;
  url?: string;
  customerName?: string;
  region?: string;
  nmck?: number;
  publishDate?: Date;
  submissionDeadline?: Date;
  auctionDate?: Date;
  procurementLaw?: string;
  category?: string;
  priority?: string;
  officialNumber?: string;
  officialUrl?: string;
  documentsUrl?: string;
  payloadJson: Prisma.InputJsonObject;
};

export type ImportParseResult =
  | { ok: true; tender: ImportedTender }
  | { ok: false; message: string };

const PRIORITIES = new Set(['hot', 'review', 'wide']);

/**
 * Maps one item of a tender feed to CRM fields.
 * Understands the tender parser's export (snake_case: tender_number, customer,
 * price, deadline, published_at, review_priority, official_*) and the camelCase
 * names of the CRM itself.
 */
export function parseImportedTender(raw: unknown, defaultOffset: string): ImportParseResult {
  if (!isRecord(raw)) {
    return { ok: false, message: 'Item must be an object' };
  }

  const title = text(raw.title, 1000);

  if (!title) {
    return { ok: false, message: 'title is required' };
  }

  const source = pickText(raw, ['source'], 100);
  const sourceNumber = pickText(raw, ['tender_number', 'tenderNumber', 'number'], 200);
  const sourceUrl = pickText(raw, ['url'], 2000);
  const identity = sourceNumber ?? sourceUrl?.split('#', 1)[0].replace(/\/+$/, '');

  if (!identity) {
    return { ok: false, message: 'tender_number or url is required to identify the tender' };
  }

  const officialNumber = pickText(raw, ['official_number', 'officialNumber'], 200);
  const officialUrl = pickText(raw, ['official_url', 'officialUrl'], 2000);
  const platformUrl = pickText(raw, ['platform_url', 'platformUrl'], 2000);
  const priority = pickText(raw, ['review_priority', 'priority'], 20)?.toLowerCase();
  const matchedTerms = Array.isArray(raw.matched_terms ?? raw.matchedTerms)
    ? ((raw.matched_terms ?? raw.matchedTerms) as unknown[])
        .map((term) => text(term, 100))
        .filter((term): term is string => Boolean(term))
        .slice(0, 30)
    : [];

  return {
    ok: true,
    tender: {
      externalKey: `${source ?? 'unknown'}:${identity}`.slice(0, 500),
      title,
      // Show people the number of the original procurement system when it is known.
      tenderNumber:
        officialNumber ?? pickText(raw, ['platform_number', 'platformNumber'], 200) ?? sourceNumber,
      platform: pickText(raw, ['official_source', 'officialSource', 'platform'], 100) ?? source,
      url: officialUrl ?? platformUrl ?? sourceUrl,
      customerName: pickText(raw, ['customer', 'customer_name', 'customerName'], 500),
      region: pickText(raw, ['region'], 200),
      nmck: amount(raw.price ?? raw.nmck),
      publishDate: dateTime(raw.published_at ?? raw.publish_date ?? raw.publishDate, defaultOffset),
      submissionDeadline: dateTime(
        raw.deadline ?? raw.submission_deadline ?? raw.submissionDeadline,
        defaultOffset
      ),
      auctionDate: dateTime(raw.auction_date ?? raw.auctionDate, defaultOffset),
      procurementLaw: pickText(raw, ['procurement_law', 'procurementLaw'], 100),
      category: pickText(raw, ['category'], 200),
      priority: priority && PRIORITIES.has(priority) ? priority : undefined,
      officialNumber,
      officialUrl,
      documentsUrl: pickText(raw, ['documents_url', 'documentsUrl'], 2000),
      payloadJson: {
        source: source ?? null,
        sourceNumber: sourceNumber ?? null,
        sourceUrl: sourceUrl ?? null,
        sourceStatus: pickText(raw, ['status'], 100) ?? null,
        filterStatus: pickText(raw, ['filter_status', 'filterStatus'], 40) ?? null,
        matchConfidence: pickText(raw, ['match_confidence', 'matchConfidence'], 40) ?? null,
        includeReason: pickText(raw, ['include_reason', 'includeReason'], 1000) ?? null,
        matchedTerms,
        deliveryRegionEvidence:
          pickText(raw, ['delivery_region_evidence', 'deliveryRegionEvidence'], 1000) ?? null,
        documentsLabel: pickText(raw, ['documents_label', 'documentsLabel'], 200) ?? null,
        discoveredAt: pickText(raw, ['discovered_at', 'discoveredAt'], 40) ?? null
      }
    }
  };
}

/** Only defined values: an import never blanks a field that was filled before. */
export function definedFields(tender: ImportedTender) {
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(tender)) {
    // externalKey identifies the row and is set only on creation.
    if (key !== 'externalKey' && value !== undefined) {
      data[key] = value;
    }
  }

  return data;
}
