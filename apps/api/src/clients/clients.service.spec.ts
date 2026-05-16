import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  const prisma = {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    clientContact: {
      updateMany: jest.fn(),
      create: jest.fn()
    },
    clientComment: {
      create: jest.fn()
    },
    clientFile: {
      create: jest.fn()
    },
    activityLog: {
      findMany: jest.fn()
    }
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
    permissions: ['clients.view', 'clients.create', 'clients.update', 'clients.delete']
  };
  const manager = {
    id: 'manager-1',
    email: 'manager@example.com',
    fullName: 'Manager',
    role: 'manager',
    roleName: 'Manager',
    permissions: ['clients.view', 'clients.create', 'clients.update']
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a client with contacts and writes audit', async () => {
    prisma.client.create.mockResolvedValue({
      id: 'client-1',
      name: 'ООО Климат',
      type: 'company',
      status: 'active',
      contacts: [
        {
          id: 'contact-1',
          contactType: 'phone',
          value: '+79780000000',
          isPrimary: true
        }
      ],
      responsibleUser: {
        id: 'owner-1',
        fullName: 'Owner',
        email: 'owner@example.com'
      }
    });

    const service = new ClientsService(prisma as never, auditService as never);

    const result = await service.create(
      {
        type: 'company',
        status: 'active',
        name: 'ООО Климат',
        city: 'Симферополь',
        source: 'manual',
        responsibleUserId: 'owner-1',
        contacts: [
          {
            contactType: 'phone',
            value: '+79780000000',
            isPrimary: true
          }
        ]
      },
      owner,
      context
    );

    expect(result.id).toBe('client-1');
    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'ООО Климат',
          type: 'company',
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          contacts: {
            create: [
              expect.objectContaining({
                contactType: 'phone',
                value: '+79780000000',
                isPrimary: true
              })
            ]
          }
        }),
        include: expect.any(Object)
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'client.create',
        entityType: 'client',
        entityId: 'client-1'
      })
    );
  });

  it('limits manager list to assigned clients', async () => {
    prisma.client.findMany.mockResolvedValue([]);
    const service = new ClientsService(prisma as never, auditService as never);

    await service.list({}, manager);

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          responsibleUserId: 'manager-1'
        })
      })
    );
  });

  it('searches clients by name, legal fields, city, source, and contact value', async () => {
    prisma.client.findMany.mockResolvedValue([]);
    const service = new ClientsService(prisma as never, auditService as never);

    await service.list({ search: '7978' }, owner);

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: '7978', mode: 'insensitive' } },
            {
              contacts: {
                some: {
                  value: { contains: '7978', mode: 'insensitive' }
                }
              }
            }
          ])
        })
      })
    );
  });

  it('clears existing primary contacts of the same type before adding a new primary contact', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1', responsibleUserId: 'manager-1' });
    prisma.clientContact.create.mockResolvedValue({
      id: 'contact-2',
      clientId: 'client-1',
      contactType: 'phone',
      value: '+79781111111',
      isPrimary: true
    });
    const service = new ClientsService(prisma as never, auditService as never);

    await service.addContact(
      'client-1',
      {
        contactType: 'phone',
        value: '+79781111111',
        isPrimary: true
      },
      manager,
      context
    );

    expect(prisma.clientContact.updateMany).toHaveBeenCalledWith({
      where: {
        clientId: 'client-1',
        contactType: 'phone'
      },
      data: { isPrimary: false }
    });
    expect(prisma.clientContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          contactType: 'phone',
          isPrimary: true
        })
      })
    );
  });

  it('adds a comment and writes audit', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1', responsibleUserId: 'manager-1' });
    prisma.clientComment.create.mockResolvedValue({
      id: 'comment-1',
      clientId: 'client-1',
      userId: 'manager-1',
      text: 'Позвонил клиенту'
    });
    const service = new ClientsService(prisma as never, auditService as never);

    const result = await service.addComment('client-1', { text: 'Позвонил клиенту' }, manager, context);

    expect(result.id).toBe('comment-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'manager-1',
        action: 'client.comment.create',
        entityType: 'client',
        entityId: 'client-1'
      })
    );
  });

  it('stores uploaded file metadata and writes audit', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1', responsibleUserId: 'manager-1' });
    prisma.clientFile.create.mockResolvedValue({
      id: 'file-1',
      clientId: 'client-1',
      originalName: 'brief.pdf',
      storedName: 'stored.pdf',
      size: 1234
    });
    const service = new ClientsService(prisma as never, auditService as never);

    const result = await service.addFile(
      'client-1',
      {
        originalname: 'brief.pdf',
        filename: 'stored.pdf',
        mimetype: 'application/pdf',
        size: 1234,
        path: '/app/uploads/clients/stored.pdf'
      },
      'ТЗ клиента',
      manager,
      context
    );

    expect(result.id).toBe('file-1');
    expect(prisma.clientFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          uploadedById: 'manager-1',
          originalName: 'brief.pdf',
          storedName: 'stored.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          storagePath: '/app/uploads/clients/stored.pdf',
          comment: 'ТЗ клиента'
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'client.file.create',
        entityType: 'client',
        entityId: 'client-1'
      })
    );
  });
});
