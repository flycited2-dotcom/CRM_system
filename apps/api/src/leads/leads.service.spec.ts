import { NotImplementedException } from '@nestjs/common';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  const now = new Date('2026-05-16T10:20:00.000Z');
  const oldNow = Date.now;
  const prisma = {
    lead: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    client: {
      findFirst: jest.fn(),
      create: jest.fn()
    },
    clientContact: {
      createMany: jest.fn()
    },
    activityLog: {
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  };
  const auditService = {
    log: jest.fn()
  };
  const context = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest'
  };
  const owner = {
    id: 'owner-1',
    email: 'owner@example.com',
    fullName: 'Owner',
    role: 'owner',
    roleName: 'Owner',
    permissions: ['leads.view', 'leads.create', 'leads.update', 'leads.delete', 'leads.assign', 'leads.convert']
  };
  const manager = {
    id: 'manager-1',
    email: 'manager@example.com',
    fullName: 'Manager',
    role: 'manager',
    roleName: 'Manager',
    permissions: ['leads.view', 'leads.create', 'leads.update', 'leads.convert']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Date.now = jest.fn(() => now.getTime());
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  afterAll(() => {
    Date.now = oldNow;
  });

  it('creates a lead with assignment-derived status and writes audit', async () => {
    prisma.lead.create.mockResolvedValue({
      id: 'lead-1',
      source: 'manual',
      name: 'Ivan',
      phone: '+79990000001',
      status: 'assigned',
      responsibleUserId: 'manager-1'
    });

    const service = new LeadsService(prisma as never, auditService as never);

    const result = await service.create(
      {
        source: 'manual',
        name: 'Ivan',
        phone: '+79990000001',
        responsibleUserId: 'manager-1'
      },
      owner,
      context
    );

    expect(result.id).toBe('lead-1');
    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'manual',
          name: 'Ivan',
          phone: '+79990000001',
          status: 'assigned',
          responsibleUserId: 'manager-1',
          createdBy: 'owner-1',
          updatedBy: 'owner-1'
        }),
        include: expect.any(Object)
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'lead.create',
        entityType: 'lead',
        entityId: 'lead-1'
      })
    );
  });

  it('limits manager list to assigned or self-created leads', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const service = new LeadsService(prisma as never, auditService as never);

    await service.list({}, manager);

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: [
            { responsibleUserId: 'manager-1' },
            { createdBy: 'manager-1' }
          ]
        })
      })
    );
  });

  it('searches contact and source fields and filters overdue leads', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const service = new LeadsService(prisma as never, auditService as never);

    await service.list({ search: 'site', overdue: true }, owner);

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          receivedAt: { lte: new Date('2026-05-16T10:05:00.000Z') },
          firstResponseAt: null,
          status: { in: ['new', 'assigned'] },
          OR: expect.arrayContaining([
            { source: { contains: 'site', mode: 'insensitive' } },
            { phone: { contains: 'site', mode: 'insensitive' } },
            { email: { contains: 'site', mode: 'insensitive' } },
            { telegram: { contains: 'site', mode: 'insensitive' } }
          ])
        })
      })
    );
  });

  it('assigns a lead and records first response time', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      status: 'new',
      firstResponseAt: null,
      responsibleUserId: null
    });
    prisma.lead.update.mockResolvedValue({
      id: 'lead-1',
      status: 'assigned',
      responsibleUserId: 'manager-1',
      firstResponseAt: now
    });
    const service = new LeadsService(prisma as never, auditService as never);

    await service.assign('lead-1', { responsibleUserId: 'manager-1' }, owner, context);

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          responsibleUserId: 'manager-1',
          status: 'assigned',
          firstResponseAt: now,
          updatedBy: 'owner-1'
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'lead.assign',
        entityType: 'lead',
        entityId: 'lead-1'
      })
    );
  });

  it('closes a lead with reason and writes audit', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', status: 'in_progress' });
    prisma.lead.update.mockResolvedValue({
      id: 'lead-1',
      status: 'closed',
      closedAt: now,
      closeReason: 'duplicate'
    });
    const service = new LeadsService(prisma as never, auditService as never);

    await service.close('lead-1', { closeReason: 'duplicate' }, manager, context);

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          status: 'closed',
          closedAt: now,
          closeReason: 'duplicate',
          updatedBy: 'manager-1'
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'lead.close',
        entityType: 'lead',
        entityId: 'lead-1'
      })
    );
  });

  it('converts a lead into a client with contacts', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      name: 'Ivan',
      phone: '+79990000001',
      email: 'ivan@example.com',
      telegram: '@ivan',
      city: 'Simferopol',
      source: 'site',
      responsibleUserId: 'manager-1',
      firstResponseAt: null
    });
    prisma.client.create.mockResolvedValue({
      id: 'client-1',
      name: 'Ivan'
    });
    prisma.clientContact.createMany.mockResolvedValue({ count: 3 });
    prisma.lead.update.mockResolvedValue({
      id: 'lead-1',
      status: 'converted',
      clientId: 'client-1'
    });
    const service = new LeadsService(prisma as never, auditService as never);

    const result = await service.convertToClient('lead-1', {}, manager, context);

    expect(result.clientId).toBe('client-1');
    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'individual',
          status: 'active',
          name: 'Ivan',
          city: 'Simferopol',
          source: 'site',
          responsibleUserId: 'manager-1'
        })
      })
    );
    expect(prisma.clientContact.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ clientId: 'client-1', contactType: 'phone', value: '+79990000001' }),
        expect.objectContaining({ clientId: 'client-1', contactType: 'email', value: 'ivan@example.com' }),
        expect.objectContaining({ clientId: 'client-1', contactType: 'telegram', value: '@ivan' })
      ])
    });
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          status: 'converted',
          clientId: 'client-1',
          firstResponseAt: now,
          closedAt: now,
          updatedBy: 'manager-1'
        })
      })
    );
  });

  it('keeps deal conversion unavailable until deals stage', async () => {
    const service = new LeadsService(prisma as never, auditService as never);

    await expect(service.convertToDeal()).rejects.toBeInstanceOf(NotImplementedException);
  });
});
