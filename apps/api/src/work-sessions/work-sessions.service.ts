import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForLogin(userId: string, ipAddress?: string, userAgent?: string) {
    await this.finishLatestForUser(userId);

    return this.prisma.workSession.create({
      data: {
        userId,
        ipAddress,
        userAgent,
        device: userAgent ? userAgent.slice(0, 180) : undefined,
        status: 'open'
      }
    });
  }

  async finishLatestForUser(userId: string) {
    const openSession = await this.prisma.workSession.findFirst({
      where: {
        userId,
        status: 'open'
      },
      orderBy: { loginAt: 'desc' }
    });

    if (!openSession) {
      return null;
    }

    const logoutAt = new Date();
    const totalMinutes = Math.max(
      0,
      Math.round((logoutAt.getTime() - openSession.loginAt.getTime()) / 60000)
    );

    return this.prisma.workSession.update({
      where: { id: openSession.id },
      data: {
        logoutAt,
        totalMinutes,
        status: 'closed'
      }
    });
  }

  async list() {
    return this.prisma.workSession.findMany({
      orderBy: { loginAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    });
  }

  async listMine(userId: string) {
    return this.prisma.workSession.findMany({
      where: { userId },
      orderBy: { loginAt: 'desc' }
    });
  }
}
