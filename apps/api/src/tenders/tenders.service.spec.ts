import { TendersService } from './tenders.service';
import { parseImportedTender } from './tender-import';

const OFFSET = '+03:00';

describe('parseImportedTender', () => {
  it('maps the tender parser export to CRM fields', () => {
    const outcome = parseImportedTender(
      {
        title: 'Поставка кондиционеров',
        url: 'https://rostender.info/tender/96350849',
        source: 'rostender',
        tender_number: '96350849',
        customer: 'ГБУЗ РК Больница',
        region: 'Крым республика',
        price: 1240000.5,
        deadline: '2026-11-10T23:59:00',
        published_at: '2026-11-10',
        review_priority: 'hot',
        category: 'Климатическая техника',
        official_number: '0375200000126000123',
        official_url: 'https://zakupki.gov.ru/epz/order/notice/view?regNumber=0375200000126000123',
        official_source: 'eis-zakupki',
        procurement_law: '44-ФЗ',
        matched_terms: ['кондиционер', 'сплит'],
        unknown_field: 'ignored'
      },
      OFFSET
    );

    expect(outcome.ok).toBe(true);

    if (!outcome.ok) {
      return;
    }

    expect(outcome.tender).toMatchObject({
      externalKey: 'rostender:96350849',
      title: 'Поставка кондиционеров',
      tenderNumber: '0375200000126000123',
      platform: 'eis-zakupki',
      url: 'https://zakupki.gov.ru/epz/order/notice/view?regNumber=0375200000126000123',
      customerName: 'ГБУЗ РК Больница',
      nmck: 1240000.5,
      priority: 'hot',
      officialNumber: '0375200000126000123',
      procurementLaw: '44-ФЗ'
    });
    // A date without a zone is business-local time (UTC+3), not UTC.
    expect(outcome.tender.submissionDeadline?.toISOString()).toBe('2026-11-10T20:59:00.000Z');
    expect(outcome.tender.publishDate?.toISOString()).toBe('2026-11-09T21:00:00.000Z');
    expect(outcome.tender.payloadJson.matchedTerms).toEqual(['кондиционер', 'сплит']);
    expect(outcome.tender.payloadJson.sourceUrl).toBe('https://rostender.info/tender/96350849');
  });

  it('identifies a tender by url when it has no number', () => {
    const outcome = parseImportedTender(
      { title: 'Закупка', source: 'torgi82', url: 'https://torgi82.ru/lot/15/#docs' },
      OFFSET
    );

    expect(outcome.ok && outcome.tender.externalKey).toBe('torgi82:https://torgi82.ru/lot/15');
  });

  it('rejects items without a title or an identity', () => {
    expect(parseImportedTender({ url: 'https://example.org/1' }, OFFSET)).toEqual({
      ok: false,
      message: 'title is required'
    });
    expect(parseImportedTender({ title: 'Закупка' }, OFFSET)).toEqual({
      ok: false,
      message: 'tender_number or url is required to identify the tender'
    });
    expect(parseImportedTender('text', OFFSET).ok).toBe(false);
  });

  it('drops an unknown priority instead of storing it', () => {
    const outcome = parseImportedTender(
      { title: 'Закупка', source: 'eis', tender_number: '1', review_priority: 'excluded' },
      OFFSET
    );

    expect(outcome.ok && outcome.tender.priority).toBeUndefined();
  });
});

describe('TendersService.importFromIntegration', () => {
  const prisma = {
    tender: {
      findMany: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn()
    },
    activityLog: {
      createMany: jest.fn()
    },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations))
  };
  const auditService = { log: jest.fn() };
  const integration = { id: 'integration-1', code: 'tender-parser' };
  const item = (number: string, extra: Record<string, unknown> = {}) => ({
    title: `Закупка ${number}`,
    source: 'eis-zakupki',
    tender_number: number,
    ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tender.findMany.mockResolvedValue([]);
  });

  it('creates new tenders in one batch and records their origin', async () => {
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(
      integration as never,
      [item('1'), item('2')],
      OFFSET
    );

    expect(result).toEqual({ created: 2, updated: 0, skipped: 0, errors: [] });
    expect(prisma.tender.createMany).toHaveBeenCalledTimes(1);

    const rows = prisma.tender.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Закупка 1',
      externalKey: 'eis-zakupki:1',
      source: 'tender-parser',
      integrationId: 'integration-1'
    });
    // New tenders start in the default "found" status and are not assigned.
    expect(rows[0].status).toBeUndefined();
    expect(rows[0].responsibleUserId).toBeUndefined();
    // Tenders and their origin records are written together.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const history = prisma.activityLog.createMany.mock.calls[0][0].data;
    expect(history).toHaveLength(2);
    // Column names of activity_logs: a wrong name here fails only against a real database.
    expect(Object.keys(history[0]).sort()).toEqual(['action', 'entityId', 'entityType', 'newValueJson']);
    expect(history[0]).toMatchObject({
      action: 'tender.import',
      entityType: 'tender',
      entityId: rows[0].id,
      newValueJson: { integration: 'tender-parser', externalKey: 'eis-zakupki:1' }
    });
  });

  it('refreshes an existing tender without touching what people set in the CRM', async () => {
    prisma.tender.findMany.mockResolvedValue([
      { id: 'tender-1', externalKey: 'eis-zakupki:1', officialNumber: null, deletedAt: null }
    ]);
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(
      integration as never,
      [item('1', { price: 500000, customer: null })],
      OFFSET
    );

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    expect(prisma.tender.createMany).not.toHaveBeenCalled();

    const update = prisma.tender.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'tender-1' });
    expect(update.data.nmck).toBe(500000);
    // A missing value in the feed must not blank the stored one.
    expect('customerName' in update.data).toBe(false);

    for (const field of ['status', 'responsibleUserId', 'comment', 'margin', 'result', 'requirements']) {
      expect(field in update.data).toBe(false);
    }
  });

  it('matches the same tender coming through another aggregator by its official number', async () => {
    prisma.tender.findMany.mockResolvedValue([
      { id: 'tender-1', externalKey: 'eis-zakupki:0375', officialNumber: '0375', deletedAt: null }
    ]);
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(
      integration as never,
      [{ title: 'Закупка', source: 'rostender', tender_number: '96350849', official_number: '0375' }],
      OFFSET
    );

    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(prisma.tender.update.mock.calls[0][0].where).toEqual({ id: 'tender-1' });
  });

  it('does not create two tenders for two aggregator cards of one procurement in the same feed', async () => {
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(
      integration as never,
      [
        { title: 'Закупка', source: 'eis-zakupki', tender_number: '0375', official_number: '0375' },
        { title: 'Закупка', source: 'rostender', tender_number: '96350849', official_number: '0375' }
      ],
      OFFSET
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, errors: [] });
    expect(prisma.tender.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('leaves a tender deleted in the CRM deleted', async () => {
    prisma.tender.findMany.mockResolvedValue([
      { id: 'tender-1', externalKey: 'eis-zakupki:1', officialNumber: null, deletedAt: new Date() }
    ]);
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(integration as never, [item('1')], OFFSET);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(prisma.tender.createMany).not.toHaveBeenCalled();
  });

  it('reports rejected items by position and still stores the valid ones', async () => {
    const service = new TendersService(prisma as never, auditService as never);

    const result = await service.importFromIntegration(
      integration as never,
      [item('1'), { title: '' }, 'garbage', item('2')],
      OFFSET
    );

    expect(result.created).toBe(2);
    expect(result.errors).toEqual([
      { index: 1, message: 'title is required' },
      { index: 2, message: 'Item must be an object' }
    ]);
  });
});

describe('TendersService.changeStatus', () => {
  it('stores the new status and writes the transition to the audit log', async () => {
    const prisma = {
      tender: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tender-1', status: 'found' }),
        update: jest.fn().mockResolvedValue({ id: 'tender-1', status: 'analysis' })
      }
    };
    const auditService = { log: jest.fn() };
    const service = new TendersService(prisma as never, auditService as never);

    await service.changeStatus(
      'tender-1',
      { status: 'analysis' },
      { id: 'user-1' } as never,
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(prisma.tender.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tender-1' },
        data: expect.objectContaining({ status: 'analysis', updatedBy: 'user-1' })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tender.status',
        entityId: 'tender-1',
        oldValue: { status: 'found' },
        newValue: { status: 'analysis', result: null }
      })
    );
  });
});
