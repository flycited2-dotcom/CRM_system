import { TendersService } from './tenders.service';
import { parseImportedTender } from './tender-import';

const OFFSET = '+03:00';

describe('parseImportedTender work fields', () => {
  it('reads what a work journal reports about the tender', () => {
    const outcome = parseImportedTender(
      {
        title: 'Поставка картриджей',
        source: 'tender-tracker',
        tender_number: '0175100003626000035',
        procedure_type: 'Электронный аукцион',
        work_status: 'lost',
        comment: 'отправил запрос от ИП',
        taken_at: '2026-10-14',
        auction_date: '2026-10-19T10:00'
      },
      OFFSET
    );

    expect(outcome.ok).toBe(true);

    if (!outcome.ok) {
      return;
    }

    expect(outcome.sourceNumber).toBe('0175100003626000035');
    expect(outcome.tender.procedureType).toBe('Электронный аукцион');
    expect(outcome.work.status).toBe('lost');
    expect(outcome.work.comment).toBe('отправил запрос от ИП');
    expect(outcome.work.takenAt?.toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(outcome.work.auctionDate?.toISOString()).toBe('2026-10-19T07:00:00.000Z');
  });

  it('identifies a record by the id of the sending system when it has one', () => {
    const outcome = parseImportedTender(
      { title: 'Закупка', source: 'tender-tracker', external_id: 'row-1', tender_number: '11148875' },
      OFFSET
    );

    expect(outcome.ok && outcome.tender.externalKey).toBe('tender-tracker:row-1');
    expect(outcome.ok && outcome.sourceNumber).toBe('11148875');
  });

  it('rejects a status the CRM does not have', () => {
    expect(
      parseImportedTender(
        { title: 'Закупка', source: 'tender-tracker', tender_number: '123456', work_status: 'В работе' },
        OFFSET
      )
    ).toEqual({ ok: false, message: 'Unknown work_status: в работе' });
  });
});

describe('TendersService.importFromIntegration from a work journal', () => {
  const prisma = {
    tender: {
      findMany: jest.fn(),
      update: jest.fn((args: unknown) => args),
      createMany: jest.fn()
    },
    activityLog: {
      createMany: jest.fn(),
      create: jest.fn((args: unknown) => args)
    },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations))
  };
  const tracker = { id: 'tracker-1', code: 'tender-tracker', type: 'tender_tracker' };
  const parser = { id: 'parser-1', code: 'tender-parser', type: 'tender_parser' };
  const entry = (extra: Record<string, unknown> = {}) => ({
    title: 'Поставка картриджей',
    source: 'tender-tracker',
    tender_number: '0175100003626000035',
    customer: 'Прокуратура',
    price: 1975600,
    work_status: 'analysis',
    comment: 'делаем подбор',
    ...extra
  });
  // A tender the parser found earlier, untouched by people.
  const found = (extra: Record<string, unknown> = {}) => ({
    id: 'tender-1',
    externalKey: 'eis-zakupki:0175100003626000035',
    officialNumber: '0175100003626000035',
    tenderNumber: '0175100003626000035',
    integrationId: 'parser-1',
    deletedAt: null,
    status: 'found',
    comment: null,
    takenAt: null,
    journalJson: null,
    title: 'Поставка картриджей к оргтехнике',
    customerName: null,
    nmck: null,
    ...extra
  });
  // The same tender after the journal's first delivery.
  const delivered = (extra: Record<string, unknown> = {}) =>
    found({
      status: 'analysis',
      comment: 'делаем подбор',
      customerName: 'Прокуратура',
      nmck: '1975600',
      journalJson: { status: 'analysis', comment: 'делаем подбор' },
      ...extra
    });
  const service = () => new TendersService(prisma as never, { log: jest.fn() } as never);
  const firstUpdate = () =>
    prisma.tender.update.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tender.findMany.mockResolvedValue([]);
  });

  it('creates a tender with the status the team set and marks a registry number as official', async () => {
    const result = await service().importFromIntegration(tracker as never, [entry()], OFFSET);

    expect(result).toMatchObject({ created: 1, updated: 0 });

    const row = prisma.tender.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      status: 'analysis',
      comment: 'делаем подбор',
      officialNumber: '0175100003626000035',
      journalJson: { status: 'analysis', comment: 'делаем подбор' }
    });
    expect(prisma.activityLog.createMany.mock.calls[0][0].data[0].newValueJson).toMatchObject({
      status: 'analysis'
    });
  });

  it('does not take a platform number for a registry one', async () => {
    await service().importFromIntegration(
      tracker as never,
      [entry({ tender_number: '11148875' })],
      OFFSET
    );

    expect(prisma.tender.createMany.mock.calls[0][0].data[0].officialNumber).toBeUndefined();
  });

  it('sets the status of a tender the parser found, keeps its description and records the change', async () => {
    prisma.tender.findMany.mockResolvedValue([found()]);

    const result = await service().importFromIntegration(tracker as never, [entry()], OFFSET);

    expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(prisma.tender.createMany).not.toHaveBeenCalled();

    const update = firstUpdate();
    expect(update.where).toEqual({ id: 'tender-1' });
    expect(update.data).toMatchObject({
      status: 'analysis',
      comment: 'делаем подбор',
      // Blanks of the parser's tender are filled...
      customerName: 'Прокуратура',
      nmck: 1975600
    });

    // ...but what the parser described is left to the parser.
    for (const field of ['title', 'payloadJson', 'lastSeenAt']) {
      expect(field in update.data).toBe(false);
    }

    const history = prisma.activityLog.create.mock.calls[0][0] as { data: Record<string, unknown> };
    // Column names of activity_logs: a wrong name fails only against a real database.
    expect(Object.keys(history.data).sort()).toEqual([
      'action',
      'entityId',
      'entityType',
      'newValueJson',
      'oldValueJson'
    ]);
    expect(history.data).toMatchObject({
      action: 'tender.status',
      entityId: 'tender-1',
      oldValueJson: { status: 'found' },
      newValueJson: { status: 'analysis', integration: 'tender-tracker' }
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('finds the tender by a platform number too', async () => {
    prisma.tender.findMany.mockResolvedValue([
      found({ officialNumber: null, tenderNumber: '11148875', externalKey: 'sber-ast:11148875' })
    ]);

    const result = await service().importFromIntegration(
      tracker as never,
      [entry({ tender_number: '11148875' })],
      OFFSET
    );

    expect(result).toMatchObject({ created: 0, updated: 1 });
  });

  it('writes nothing when the journal is resent unchanged', async () => {
    prisma.tender.findMany.mockResolvedValue([delivered()]);

    const result = await service().importFromIntegration(tracker as never, [entry()], OFFSET);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('keeps a status set in the CRM while the journal repeats its old one', async () => {
    prisma.tender.findMany.mockResolvedValue([delivered({ status: 'pricing' })]);

    const result = await service().importFromIntegration(tracker as never, [entry()], OFFSET);

    expect(result.skipped).toBe(1);
    expect(prisma.tender.update).not.toHaveBeenCalled();
  });

  it('applies a status the journal changed, over the one set in the CRM', async () => {
    prisma.tender.findMany.mockResolvedValue([delivered({ status: 'pricing' })]);

    const result = await service().importFromIntegration(
      tracker as never,
      [entry({ work_status: 'declined' })],
      OFFSET
    );

    expect(result.updated).toBe(1);

    const update = firstUpdate();
    expect(update.data).toMatchObject({
      status: 'declined',
      journalJson: { status: 'declined', comment: 'делаем подбор' }
    });
    // The comment did not change in the journal: it is not sent again.
    expect('comment' in update.data).toBe(false);
  });

  it('ignores work fields from a feed that only finds tenders', async () => {
    prisma.tender.findMany.mockResolvedValue([found()]);

    await service().importFromIntegration(
      parser as never,
      [entry({ source: 'eis-zakupki' })],
      OFFSET
    );

    const update = firstUpdate();

    for (const field of ['status', 'comment', 'takenAt', 'journalJson']) {
      expect(field in update.data).toBe(false);
    }

    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
});
