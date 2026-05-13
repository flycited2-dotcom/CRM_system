import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-user';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token is required');
    }

    const token = authorization.slice('Bearer '.length);
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        isActive: true,
        status: 'active'
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.code,
      roleName: user.role.name,
      permissions: user.role.rolePermissions.map((item) => item.permission.code)
    };

    return true;
  }
}
