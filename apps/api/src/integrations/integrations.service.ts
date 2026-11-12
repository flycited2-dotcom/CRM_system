import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Integration, IntegrationStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateIntegrationDto } from './dto/create-integration.dto';
import type { UpdateIntegrationDto } from './dto/update-integration.dto';

const KEY_PREFIX = 'crm_';

// Never return the key hash to clients.
const publicSelect = {
  id: true,
  type: true,
  name: true,
  code: true,
  status: true,
  keyPrefix: true,
  description: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.IntegrationSelect;

type IntegrationLogInput = {
  integrationId: string;
  operation: string;
  status: 'success' | 'partial' | 'duplicate' | 'error';
  request?: Prisma.InputJsonValue;
  response?: Prisma.InputJsonValue;
  errorMessage?: string;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  list() {
    return this.prisma.integration.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: publicSelect
    });
  }

  async create(dto: CreateIntegrationDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.integration.findUnique({ where: { code: dto.code } });

    if (existing) {
      throw new ConflictException('Integration with this code already exists');
    }

    const key = this.generateKey();
    const integration = await this.prisma.integration.create({
      data: {
        type: dto.type,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        keyHash: this.hashKey(key),
        keyPrefix: key.slice(0, KEY_PREFIX.length + 6),
        createdBy: actor.id,
        updatedBy: actor.id
      },
      select: publicSelect
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'integration.create',
      entityType: 'integration',
      entityId: integration.id,
      newValue: { code: integration.code, type: integration.type },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    // The only moment the key is available in clear text.
    return { ...integration, key };
  }

  async update(id: string, dto: UpdateIntegrationDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.findActiveOrThrow(id);

    const integration = await this.prisma.integration.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        updatedBy: actor.id
      },
      select: publicSelect
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'integration.update',
      entityType: 'integration',
      entityId: id,
      newValue: { name: integration.name, status: integration.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return integration;
  }

  async rotateKey(id: string, actor: AuthenticatedUser, context: RequestContext) {
    await this.findActiveOrThrow(id);

    const key = this.generateKey();
    const integration = await this.prisma.integration.update({
      where: { id },
      data: {
        keyHash: this.hashKey(key),
        keyPrefix: key.slice(0, KEY_PREFIX.length + 6),
        updatedBy: actor.id
      },
      select: publicSelect
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'integration.rotate_key',
      entityType: 'integration',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { ...integration, key };
  }

  async softDelete(id: string, actor: AuthenticatedUser, context: RequestContext) {
    await this.findActiveOrThrow(id);

    await this.prisma.integration.update({
      where: { id },
      data: {
        status: IntegrationStatus.disabled,
        deletedAt: new Date(),
        updatedBy: actor.id
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: 'integration.delete',
      entityType: 'integration',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  async logs(id: string, limit = 50) {
    await this.findActiveOrThrow(id);

    return this.prisma.integrationLog.findMany({
      where: { integrationId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200)
    });
  }

  /** Resolves an API key to its integration; null when the key is unknown or revoked. */
  async authenticate(key: string): Promise<Integration | null> {
    if (!key.startsWith(KEY_PREFIX)) {
      return null;
    }

    const integration = await this.prisma.integration.findUnique({
      where: { keyHash: this.hashKey(key) }
    });

    if (!integration || integration.deletedAt || integration.status !== IntegrationStatus.active) {
      return null;
    }

    return integration;
  }

  async writeLog(input: IntegrationLogInput) {
    await this.prisma.integrationLog.create({
      data: {
        integrationId: input.integrationId,
        operation: input.operation,
        status: input.status,
        requestJson: input.request,
        responseJson: input.response,
        errorMessage: input.errorMessage
      }
    });

    if (input.status !== 'error') {
      await this.prisma.integration.update({
        where: { id: input.integrationId },
        data: { lastSyncAt: new Date() }
      });
    }
  }

  private async findActiveOrThrow(id: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id, deletedAt: null },
      select: publicSelect
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  private generateKey() {
    return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  }

  private hashKey(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }
}
