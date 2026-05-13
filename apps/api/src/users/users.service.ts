import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const userInclude = {
  role: {
    select: {
      id: true,
      code: true,
      name: true
    }
  }
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: userInclude
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(dto: CreateUserDto, actorId: string, context: RequestContext) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing && !existing.deletedAt) {
      throw new ConflictException('User with this email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email,
        phone: dto.phone,
        passwordHash,
        roleId: role.id,
        createdBy: actorId,
        updatedBy: actorId,
        status: 'active',
        isActive: true
      },
      include: userInclude
    });

    await this.auditService.log({
      userId: actorId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      newValue: {
        email: user.email,
        fullName: user.fullName,
        role: user.role.code
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string, context: RequestContext) {
    await this.findById(id);

    const data: Record<string, unknown> = {
      updatedBy: actorId
    };

    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName;
    }

    if (dto.email !== undefined) {
      data.email = dto.email.toLowerCase();
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }

    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    if (dto.roleCode !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      data.roleId = role.id;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: userInclude
    });

    await this.auditService.log({
      userId: actorId,
      action: 'user.update',
      entityType: 'user',
      entityId: user.id,
      newValue: {
        email: user.email,
        fullName: user.fullName,
        role: user.role.code
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return user;
  }

  async softDelete(id: string, actorId: string, context: RequestContext) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'deleted',
        isActive: false,
        updatedBy: actorId
      },
      include: userInclude
    });

    await this.auditService.log({
      userId: actorId,
      action: 'user.delete',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { success: true };
  }

  async block(id: string, actorId: string, context: RequestContext) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'blocked',
        isActive: false,
        updatedBy: actorId
      },
      include: userInclude
    });

    await this.auditService.log({
      userId: actorId,
      action: 'user.block',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return user;
  }

  async unblock(id: string, actorId: string, context: RequestContext) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'active',
        isActive: true,
        updatedBy: actorId
      },
      include: userInclude
    });

    await this.auditService.log({
      userId: actorId,
      action: 'user.unblock',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return user;
  }
}
