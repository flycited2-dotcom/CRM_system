# CRM Control

Личная внутренняя CRM для управленческого контура торговой компании: сотрудники, роли, авторизация, рабочие сессии и audit log как фундамент для следующих модулей.

## Что уже входит

- Monorepo на npm workspaces.
- Backend: NestJS, Prisma, PostgreSQL, JWT, RBAC, Swagger.
- Frontend: Next.js App Router, login, dashboard, экран сотрудников, экран клиентов, карточка клиента, экран лидов и карточка лида.
- Сущности Stage 0/1: users, roles, permissions, refresh tokens, work sessions, activity logs.
- Сущности Stage 2: clients, client_contacts, client_comments, client_files.
- Сущности Stage 3: leads.
- Seed ролей и стартового owner-пользователя.

## Требования

- Node.js 20.19+.
- npm.
- PostgreSQL 16.
- Redis 7.
- Docker удобен для локальной БД, но на текущей машине команда `docker` не найдена.

## Установка

```powershell
npm.cmd install
```

Создайте локальный env:

```powershell
Copy-Item .env.example .env
```

Минимальные локальные значения уже указаны в `.env.example`.

## База данных

Если Docker установлен:

```powershell
docker compose up -d
```

Если Docker не установлен, создайте PostgreSQL базу вручную и проверьте `DATABASE_URL` в `.env`.

Сгенерировать Prisma Client:

```powershell
$env:DATABASE_URL="postgresql://crm:crm@localhost:5432/crm?schema=public"
npm.cmd run prisma:generate -w @crm/api
```

Применить миграцию на локальную БД:

```powershell
$env:DATABASE_URL="postgresql://crm:crm@localhost:5432/crm?schema=public"
npm.cmd run prisma:migrate -w @crm/api -- --name init
```

Создать стартовые роли, permissions и owner:

```powershell
$env:DATABASE_URL="postgresql://crm:crm@localhost:5432/crm?schema=public"
npm.cmd run prisma:seed -w @crm/api
```

Стартовый вход:

- Email: `owner@example.com`
- Пароль: `ChangeMe123!`

## Запуск

API:

```powershell
npm.cmd run dev:api
```

Web:

```powershell
npm.cmd run dev:web
```

Адреса:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/health`
- Swagger: `http://localhost:4000/api/docs`
- Clients: `http://localhost:3000/clients`
- Leads: `http://localhost:3000/leads`

## Модуль клиентов

Stage 2 добавляет полный базовый контур клиентов:

- CRUD клиентов с типом, статусом, реквизитами, адресами, городом, источником и ответственным.
- Контакты клиента: телефон, email, Telegram, MAX, WhatsApp и другое.
- Комментарии, файлы и история действий в карточке клиента.
- Поиск и фильтры по списку клиентов.
- Права `clients.view`, `clients.create`, `clients.update`, `clients.delete`.

Файлы клиентов сохраняются API в `CLIENT_UPLOAD_DIR`, по умолчанию `/app/uploads/clients`.
В production compose для этого подключён named volume `crm_uploads:/app/uploads`.

## Модуль лидов

Stage 3 добавляет внутренний контур обработки лидов:

- ручное создание лидов;
- статусы `new`, `assigned`, `in_progress`, `converted`, `closed`;
- назначение ответственного;
- подсветка лидов без первого ответа более 15 минут;
- закрытие с причиной;
- конвертация лида в клиента с переносом телефона, email и Telegram;
- заготовка API для конвертации в сделку до запуска модуля сделок;
- история действий через audit log.

Публичные webhooks сайтов и реальные Telegram/email-уведомления не входят в этот этап: сначала стабилизируется внутренний модуль лидов.

## Проверка

```powershell
npm.cmd run test
npm.cmd run build
```

PowerShell на этой машине блокирует `npm.ps1`, поэтому используйте `npm.cmd`.

## VPS deployment

Первый staging-деплой описан в [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md).
