import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = {
    signAsync: jest.fn()
  };
  const configService = {
    get: jest.fn()
  };
  const workSessionsService = {
    createForLogin: jest.fn(),
    finishLatestForUser: jest.fn()
  };
  const auditService = {
    log: jest.fn()
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('access-token');
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_EXPIRES_IN: '15m',
        REFRESH_TOKEN_DAYS: '30'
      };
      return values[key];
    });
    workSessionsService.createForLogin.mockResolvedValue({ id: 'session-1' });
  });

  it('creates a work session and audit event when credentials are valid', async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'CRM Owner',
      passwordHash,
      status: 'active',
      isActive: true,
      role: {
        code: 'owner',
        name: 'Собственник',
        rolePermissions: [
          {
            permission: {
              code: 'users.view'
            }
          }
        ]
      }
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      workSessionsService as never,
      auditService as never
    );

    const result = await service.login(
      { email: 'owner@example.com', password: 'Secret123!' },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'owner@example.com',
      role: 'owner',
      permissions: ['users.view']
    });
    expect(workSessionsService.createForLogin).toHaveBeenCalledWith(
      'user-1',
      '127.0.0.1',
      'jest'
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'user.login',
        entityType: 'user',
        entityId: 'user-1'
      })
    );
  });

  it('rejects a blocked user before issuing tokens', async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'CRM Owner',
      passwordHash,
      status: 'blocked',
      isActive: false,
      role: {
        code: 'owner',
        name: 'Собственник',
        rolePermissions: []
      }
    });

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      workSessionsService as never,
      auditService as never
    );

    await expect(
      service.login(
        { email: 'owner@example.com', password: 'Secret123!' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' }
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(workSessionsService.createForLogin).not.toHaveBeenCalled();
  });
});
