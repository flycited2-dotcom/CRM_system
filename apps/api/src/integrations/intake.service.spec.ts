import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { IntakeService } from './intake.service';
import { IntegrationsService } from './integrations.service';
import { normalizePhone } from './normalize';

describe('normalizePhone', () => {
  it('brings different spellings of one number to the same value', () => {
    expect(normalizePhone('8 (978) 000-00-01')).toBe('+79780000001');
    expect(normalizePhone('+7 978 000 00 01')).toBe('+79780000001');
    expect(normalizePhone('9780000001')).toBe('+79780000001');
  });

  it('keeps a value it cannot interpret as a phone number', () => {
    expect(normalizePhone('доб. 12')).toBe('доб. 12');
    expect(normalizePhone('')).toBeUndefined();
  });
});

describe('IntakeService.createLead', () => {
  const prisma = {
    lead: {
      findFirst: jest.fn(),
      create: jest.fn()
    }
  };
  const integrationsService = { writeLog: jest.fn() };
  const tendersService = { importFromIntegration: jest.fn() };
  const auditService = { log: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue(undefined) };
  const integration = { id: 'integration-1', code: 'splihub.ru' };

  const createService = () =>
    new IntakeService(
      prisma as never,
      integrationsService as never,
      tendersService as never,
      auditService as never,
      configService as never
    );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
  });

  it('creates a lead from the site webhook payload', async () => {
    const result = await createService().createLead(integration as never, {
      site: 'splihub.ru',
      pageUrl: 'https://splihub.ru/catalog/item',
      name: 'Иван',
      phone: '8 (978) 000-00-01',
      email: 'Client@Example.com',
      message: 'Нужен кондиционер',
      productInterest: 'MDV 09',
      city: 'Симферополь',
      utm: { source: 'yandex', medium: 'cpc', campaign: 'split' },
      someFutureField: 'ignored'
    });

    expect(result).toEqual({ success: true, leadId: 'lead-1', created: true, duplicateOfId: null });

    const data = prisma.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      source: 'splihub.ru',
      site: 'splihub.ru',
      name: 'Иван',
      phone: '+79780000001',
      email: 'client@example.com',
      utmSource: 'yandex',
      utmMedium: 'cpc',
      utmCampaign: 'split',
      productInterest: 'MDV 09',
      integrationId: 'integration-1'
    });
    expect('someFutureField' in data).toBe(false);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead.intake', entityId: 'lead-1' })
    );
    expect(integrationsService.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'lead.create', status: 'success' })
    );
  });

  it('returns the existing lead when the same externalId is delivered again', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({ id: 'lead-existing' });

    const result = await createService().createLead(integration as never, {
      externalId: 'form-42',
      phone: '+79780000001'
    });

    expect(result).toEqual({ success: true, leadId: 'lead-existing', created: false });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { integrationId: 'integration-1', externalId: 'form-42' }
      })
    );
  });

  it('flags a new lead as a duplicate of an earlier one with the same phone', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({ id: 'lead-earlier' });

    const result = await createService().createLead(integration as never, {
      phone: '8 978 000 00 01'
    });

    expect(result.duplicateOfId).toBe('lead-earlier');
    expect(prisma.lead.create.mock.calls[0][0].data.duplicateOfId).toBe('lead-earlier');
    expect(prisma.lead.findFirst.mock.calls[0][0].where.OR).toEqual([{ phone: '+79780000001' }]);
  });

  it('rejects a payload without any contact or text and logs the failure', async () => {
    await expect(
      createService().createLead(integration as never, { site: 'splihub.ru' })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(integrationsService.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'lead.create', status: 'error' })
    );
  });

  it('does not copy contact details into the integration log', async () => {
    await createService().createLead(integration as never, {
      phone: '+79780000001',
      email: 'client@example.com'
    });

    const logged = JSON.stringify(integrationsService.writeLog.mock.calls[0][0]);
    expect(logged).not.toContain('79780000001');
    expect(logged).not.toContain('client@example.com');
  });
});

describe('IntakeService.importTenders', () => {
  it('rejects a body that is not a list of items', async () => {
    const integrationsService = { writeLog: jest.fn() };
    const service = new IntakeService(
      {} as never,
      integrationsService as never,
      { importFromIntegration: jest.fn() } as never,
      { log: jest.fn() } as never,
      { get: jest.fn() } as never
    );

    await expect(
      service.importTenders({ id: 'integration-1' } as never, { tenders: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('IntegrationsService keys', () => {
  const prisma = {
    integration: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  };
  const auditService = { log: jest.fn() };
  const actor = { id: 'owner-1' };
  const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the key once and stores only its hash', async () => {
    prisma.integration.findUnique.mockResolvedValue(null);
    prisma.integration.create.mockImplementation(async ({ data }) => ({ id: 'integration-1', ...data }));
    const service = new IntegrationsService(prisma as never, auditService as never);

    const created = await service.create(
      { type: 'site', name: 'SplitHub', code: 'splihub.ru' } as never,
      actor as never,
      context
    );

    expect(created.key).toMatch(/^crm_[A-Za-z0-9_-]{43}$/);

    const stored = prisma.integration.create.mock.calls[0][0].data;
    expect(stored.keyHash).toBe(createHash('sha256').update(created.key).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(created.key.startsWith(stored.keyPrefix)).toBe(true);
  });

  it('authenticates only active, non-deleted integrations', async () => {
    const service = new IntegrationsService(prisma as never, auditService as never);

    prisma.integration.findUnique.mockResolvedValue({ id: 'i1', status: 'active', deletedAt: null });
    await expect(service.authenticate('crm_valid')).resolves.toMatchObject({ id: 'i1' });

    prisma.integration.findUnique.mockResolvedValue({ id: 'i1', status: 'disabled', deletedAt: null });
    await expect(service.authenticate('crm_valid')).resolves.toBeNull();

    prisma.integration.findUnique.mockResolvedValue({ id: 'i1', status: 'active', deletedAt: new Date() });
    await expect(service.authenticate('crm_valid')).resolves.toBeNull();

    prisma.integration.findUnique.mockResolvedValue(null);
    await expect(service.authenticate('crm_unknown')).resolves.toBeNull();

    // A value that is not a CRM key never reaches the database.
    prisma.integration.findUnique.mockClear();
    await expect(service.authenticate('not-a-key')).resolves.toBeNull();
    expect(prisma.integration.findUnique).not.toHaveBeenCalled();
  });
});
