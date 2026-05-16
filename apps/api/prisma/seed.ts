import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  ['users.view', 'Просмотр пользователей'],
  ['users.create', 'Создание пользователей'],
  ['users.update', 'Редактирование пользователей'],
  ['users.delete', 'Удаление пользователей'],
  ['users.block', 'Блокировка пользователей'],
  ['clients.view', 'Просмотр клиентов'],
  ['clients.create', 'Создание клиентов'],
  ['clients.update', 'Редактирование клиентов'],
  ['clients.delete', 'Удаление клиентов'],
  ['leads.view', 'Просмотр лидов'],
  ['leads.create', 'Создание лидов'],
  ['leads.update', 'Редактирование лидов'],
  ['leads.delete', 'Удаление лидов'],
  ['leads.assign', 'Назначение лидов'],
  ['leads.convert', 'Конвертация лидов'],
  ['roles.view', 'Просмотр ролей'],
  ['work_sessions.view', 'Просмотр рабочих сессий'],
  ['audit.view', 'Просмотр журнала действий'],
  ['settings.manage', 'Управление настройками']
] as const;

const roles = [
  ['owner', 'Собственник', 'Полный доступ ко всем разделам CRM'],
  ['manager_head', 'Руководитель', 'Контроль отдела и операционных показателей'],
  ['manager', 'Менеджер', 'Работа со своими объектами CRM'],
  ['accountant', 'Бухгалтер', 'Финансовый контур CRM'],
  ['admin', 'Администратор', 'Техническое администрирование CRM']
] as const;

async function main() {
  for (const [code, name] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name }
    });
  }

  for (const [code, name, description] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name, description },
      create: { code, name, description }
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'owner' } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
  const managerHeadRole = await prisma.role.findUniqueOrThrow({ where: { code: 'manager_head' } });
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'manager' } });

  for (const role of [ownerRole, adminRole]) {
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  const managerHeadPermissions = allPermissions.filter((permission) =>
    [
      'users.view',
      'roles.view',
      'work_sessions.view',
      'audit.view',
      'clients.view',
      'clients.create',
      'clients.update',
      'leads.view',
      'leads.create',
      'leads.update',
      'leads.assign',
      'leads.convert'
    ].includes(permission.code)
  );

  for (const permission of managerHeadPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerHeadRole.id,
          permissionId: permission.id
        }
      },
      update: {},
      create: {
        roleId: managerHeadRole.id,
        permissionId: permission.id
      }
    });
  }

  const managerPermissions = allPermissions.filter((permission) =>
    [
      'clients.view',
      'clients.create',
      'clients.update',
      'leads.view',
      'leads.create',
      'leads.update',
      'leads.convert'
    ].includes(permission.code)
  );

  for (const permission of managerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: managerRole.id,
          permissionId: permission.id
        }
      },
      update: {},
      create: {
        roleId: managerRole.id,
        permissionId: permission.id
      }
    });
  }

  const ownerEmail = process.env.OWNER_EMAIL ?? 'owner@example.com';
  const ownerPassword = process.env.OWNER_PASSWORD ?? 'ChangeMe123!';
  const ownerFullName = process.env.OWNER_FULL_NAME ?? 'CRM Owner';
  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      fullName: ownerFullName,
      passwordHash,
      roleId: ownerRole.id,
      isActive: true,
      status: 'active'
    },
    create: {
      fullName: ownerFullName,
      email: ownerEmail,
      passwordHash,
      roleId: ownerRole.id,
      isActive: true,
      status: 'active'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
