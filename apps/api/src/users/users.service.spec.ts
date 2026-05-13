import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    role: {
      findUnique: jest.fn()
    }
  };
  const auditService = {
    log: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hashes the password and writes audit when creating a user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-1', code: 'manager' });
    prisma.user.create.mockImplementation(async ({ data }) => ({
      id: 'user-1',
      fullName: data.fullName,
      email: data.email,
      passwordHash: data.passwordHash,
      role: { code: 'manager', name: 'Менеджер' }
    }));

    const service = new UsersService(prisma as never, auditService as never);

    const result = await service.create(
      {
        fullName: 'Иван Иванов',
        email: 'ivan@example.com',
        password: 'Secret123!',
        roleCode: 'manager'
      },
      'owner-1',
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.email).toBe('ivan@example.com');
    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).not.toBe('Secret123!');
    await expect(bcrypt.compare('Secret123!', createCall.data.passwordHash)).resolves.toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'user.create',
        entityType: 'user',
        entityId: 'user-1'
      })
    );
  });

  it('blocks a user and writes audit', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      status: 'blocked',
      isActive: false
    });

    const service = new UsersService(prisma as never, auditService as never);

    const result = await service.block('user-1', 'owner-1', {
      ipAddress: '127.0.0.1',
      userAgent: 'jest'
    });

    expect(result.status).toBe('blocked');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        status: 'blocked',
        isActive: false,
        updatedBy: 'owner-1'
      },
      include: expect.any(Object)
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'user.block',
        entityType: 'user',
        entityId: 'user-1'
      })
    );
  });
});
