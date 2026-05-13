import {
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSessionsService } from '../work-sessions/work-sessions.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';

const userWithRoleInclude = {
  role: {
    include: {
      rolePermissions: {
        include: {
          permission: true
        }
      }
    }
  }
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{
  include: typeof userWithRoleInclude;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly workSessionsService: WorkSessionsService,
    private readonly auditService: AuditService
  ) {}

  async login(dto: LoginDto, context: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: userWithRoleInclude
    });

    if (!user || user.deletedAt || !user.isActive || user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const workSession = await this.workSessionsService.createForLogin(
      user.id,
      context.ipAddress,
      context.userAgent
    );
    await this.auditService.log({
      userId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    const tokens = await this.issueTokens(user, context);

    return {
      ...tokens,
      user: this.toAuthenticatedUser(user),
      workSessionId: workSession.id
    };
  }

  async refresh(dto: RefreshDto, context: RequestContext) {
    const tokenHash = this.hashToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: userWithRoleInclude
        }
      }
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt.getTime() <= Date.now() ||
      storedToken.user.deletedAt ||
      !storedToken.user.isActive ||
      storedToken.user.status !== 'active'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() }
    });

    const tokens = await this.issueTokens(storedToken.user, context);

    return {
      ...tokens,
      user: this.toAuthenticatedUser(storedToken.user)
    };
  }

  async logout(user: AuthenticatedUser, refreshToken: string | undefined, context: RequestContext) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash: this.hashToken(refreshToken),
          userId: user.id,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
    }

    await this.workSessionsService.finishLatestForUser(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogoutAt: new Date() }
    });
    await this.auditService.log({
      userId: user.id,
      action: 'user.logout',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  private async issueTokens(user: UserWithRole, context: RequestContext) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email
    });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenDays = Number(this.configService.get<string>('REFRESH_TOKEN_DAYS') ?? 30);
    const expiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }
    });

    return {
      accessToken,
      refreshToken
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(user: UserWithRole): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.code,
      roleName: user.role.name,
      permissions: user.role.rolePermissions.map((item) => item.permission.code)
    };
  }
}
