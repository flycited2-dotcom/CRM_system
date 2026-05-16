# Clients Full Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full clients stage: client records, contacts, comments, files, history, filters, client card, RBAC, tests, and staging deployment.

**Architecture:** Add a focused NestJS `ClientsModule` backed by Prisma models and existing audit/RBAC infrastructure. Add thin Next.js screens that call typed API helpers and render a dense operational client list/card experience. Store uploaded client files in a Docker volume mounted at `/app/uploads`.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js App Router, TypeScript, class-validator, Jest, Docker Compose, Nginx staging proxy.

---

## Task 1: Prisma Schema, Migration, and Seed

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260516000000_clients/migration.sql`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `docker-compose.prod.yml`
- Modify: `.env.example`
- Modify: `.env.production.example`

Steps:

1. Add enums `ClientType`, `ClientStatus`, and `ClientContactType`.
2. Add models `Client`, `ClientContact`, `ClientComment`, and `ClientFile`.
3. Add relations from `User` to responsible clients, client comments, and client files.
4. Add a SQL migration with tables, indexes, foreign keys, and soft-delete-aware indexes.
5. Add client permissions to seed:
   - `clients.view`
   - `clients.create`
   - `clients.update`
   - `clients.delete`
6. Assign all client permissions to owner/admin.
7. Assign `clients.view`, `clients.create`, and `clients.update` to manager_head and manager.
8. Add `CLIENT_UPLOAD_DIR=/app/uploads/clients` to env examples.
9. Add an `api` volume mount in production compose: `crm_uploads:/app/uploads`.
10. Run:

```powershell
$env:DATABASE_URL='postgresql://crm:crm@localhost:5432/crm?schema=public'; npm.cmd exec -w @crm/api -- prisma validate
$env:DATABASE_URL='postgresql://crm:crm@localhost:5432/crm?schema=public'; npm.cmd run prisma:generate -w @crm/api
```

Expected: Prisma schema validates and client generates.

## Task 2: Backend DTOs and Service Tests

**Files:**

- Create: `apps/api/src/clients/dto/create-client.dto.ts`
- Create: `apps/api/src/clients/dto/update-client.dto.ts`
- Create: `apps/api/src/clients/dto/client-query.dto.ts`
- Create: `apps/api/src/clients/dto/create-client-contact.dto.ts`
- Create: `apps/api/src/clients/dto/update-client-contact.dto.ts`
- Create: `apps/api/src/clients/dto/create-client-comment.dto.ts`
- Create: `apps/api/src/clients/clients.service.spec.ts`

Steps:

1. Write failing tests for:
   - owner creates a client with contacts and audit event;
   - manager list is scoped to their `responsibleUserId`;
   - owner list can search by contact value;
   - marking a contact primary clears other primary contacts of the same type;
   - adding a comment writes an audit event;
   - adding a file stores metadata and writes an audit event.
2. Run:

```powershell
npm.cmd run test -w @crm/api -- clients.service.spec.ts
```

Expected before implementation: tests fail because `ClientsService` does not exist.

## Task 3: Backend Clients Module

**Files:**

- Create: `apps/api/src/clients/clients.module.ts`
- Create: `apps/api/src/clients/clients.controller.ts`
- Create: `apps/api/src/clients/clients.service.ts`
- Modify: `apps/api/src/app.module.ts`

Steps:

1. Implement DTO validation.
2. Implement `ClientsService` methods:
   - `list(query, user)`
   - `findById(id, user)`
   - `create(dto, actor, context)`
   - `update(id, dto, actor, context)`
   - `softDelete(id, actor, context)`
   - `addContact(id, dto, actor, context)`
   - `updateContact(id, contactId, dto, actor, context)`
   - `deleteContact(id, contactId, actor, context)`
   - `listComments(id, actor)`
   - `addComment(id, dto, actor, context)`
   - `listFiles(id, actor)`
   - `addFile(id, file, comment, actor, context)`
   - `history(id, actor)`
   - `linkedDeals/linkedTasks/linkedOffers/linkedMessages` returning empty arrays.
3. Implement `ClientsController` with `JwtAuthGuard`, `PermissionsGuard`, and client permissions.
4. Wire `ClientsModule` into `AppModule`.
5. Run:

```powershell
npm.cmd run test -w @crm/api -- clients.service.spec.ts
```

Expected: clients tests pass.

## Task 4: Backend Full Verification

**Files:**

- No new files unless tests expose a focused fix.

Steps:

1. Run:

```powershell
npm.cmd run test
npm.cmd run build -w @crm/api
```

Expected: backend tests and build pass.

## Task 5: Frontend API Client

**Files:**

- Modify: `apps/web/src/lib/api.ts`

Steps:

1. Add typed `ClientRow`, `ClientDetail`, `ClientContact`, `ClientComment`, `ClientFile`, and `ClientHistoryItem`.
2. Add API helpers:
   - `fetchClients`
   - `fetchClient`
   - `createClient`
   - `updateClient`
   - `deleteClient`
   - `addClientContact`
   - `updateClientContact`
   - `deleteClientContact`
   - `addClientComment`
   - `uploadClientFile`
   - `fetchClientHistory`
3. Let `apiRequest` skip JSON content type when sending `FormData`.

## Task 6: Frontend Clients Screens

**Files:**

- Modify: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/app/clients/page.tsx`
- Create: `apps/web/src/app/clients/new/page.tsx`
- Create: `apps/web/src/app/clients/[id]/page.tsx`
- Modify: `apps/web/src/app/globals.css`

Steps:

1. Add `Клиенты` to the sidebar.
2. Build `/clients` table with search and filters for type, status, source, and responsible text.
3. Build `/clients/new` form for core client fields and first contact.
4. Build `/clients/[id]` card with tabs:
   - overview;
   - contacts;
   - comments;
   - files;
   - history;
   - deals;
   - tasks;
   - offers;
   - messages.
5. Implement create contact, add comment, and file upload interactions.
6. Add CSS for filters, detail layout, tabs, and compact forms.

## Task 7: Root Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/HANDOFF_2026-05-14.md`

Steps:

1. Update README with the clients module and upload volume notes.
2. Run:

```powershell
git diff --check
npm.cmd run test
npm.cmd run build
```

Expected: no whitespace errors; backend tests pass; API and Web builds pass.

## Task 8: Commit, Push, and VPS Deploy

**Files:**

- No local code edits after verification unless deployment exposes a defect.

Steps:

1. Commit the clients stage.
2. Push branch `codex/stage-0-1`.
3. On VPS:

```bash
cd /opt/crm
git pull --ff-only
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production -f docker-compose.prod.yml build api --progress plain
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production -f docker-compose.prod.yml build web --progress plain
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api npm run prisma:seed
```

4. Smoke-test:

```bash
curl http://213.109.202.45/api/health
```

5. Use owner login to verify:
   - `/clients` opens;
   - API can create a client;
   - API can add contact/comment/file;
   - `/clients/:id` opens and shows tabs.

## Self-Review

- Spec coverage: covers all Stage 2 checklist items: create/edit client, phone, email, Telegram, filters, search, card, linked tabs, and history. File upload is included through `ClientFile`.
- Completeness scan: each task has a concrete implementation target and verification command.
- Type consistency: DTO, model, route, and frontend type names use `Client`, `ClientContact`, `ClientComment`, `ClientFile`, and `ClientHistoryItem` consistently.
