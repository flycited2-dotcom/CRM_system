import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditLogInput = {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.activityLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValueJson: input.oldValue,
        newValueJson: input.newValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });
  }

  async list(limit = 100) {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });
  }
}
