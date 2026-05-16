# Leads Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 3 leads: internal lead CRUD, assignment, status handling, 15-minute overdue highlighting, conversion to client, audit history, frontend screens, and staging deployment.

**Architecture:** Add a focused NestJS `LeadsModule` backed by a Prisma `Lead` model and existing RBAC/audit infrastructure. Frontend screens follow the compact operational pattern already used by clients. Deal conversion keeps the API route but returns a clear not-implemented response until the deals module is built.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js App Router, TypeScript, class-validator, Jest, Docker Compose, Nginx staging proxy.

---

## Task 1: Prisma Schema, Migration, and Seed

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260516010000_leads/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

Steps:

1. Add enum `LeadStatus`:

```prisma
enum LeadStatus {
  new
  assigned
  in_progress
  converted
  closed
}
```

2. Add `User.assignedLeads` relation:

```prisma
assignedLeads  Lead[]          @relation("LeadResponsible")
```

3. Add `Client.leads` relation:

```prisma
leads             Lead[]
```

4. Add model `Lead`:

```prisma
model Lead {
  id                String     @id @default(uuid()) @db.Uuid
  source            String?
  site              String?
  pageUrl           String?    @map("page_url")
  utmSource         String?    @map("utm_source")
  utmMedium         String?    @map("utm_medium")
  utmCampaign       String?    @map("utm_campaign")
  utmContent        String?    @map("utm_content")
  utmTerm           String?    @map("utm_term")
  name              String?
  phone             String?
  email             String?
  telegram          String?
  message           String?
  productInterest   String?    @map("product_interest")
  city              String?
  ipAddress         String?    @map("ip_address")
  status            LeadStatus @default(new)
  responsibleUserId String?    @map("responsible_user_id") @db.Uuid
  responsibleUser   User?      @relation("LeadResponsible", fields: [responsibleUserId], references: [id], onDelete: SetNull)
  clientId          String?    @map("client_id") @db.Uuid
  client            Client?    @relation(fields: [clientId], references: [id], onDelete: SetNull)
  dealId            String?    @map("deal_id") @db.Uuid
  receivedAt        DateTime   @default(now()) @map("received_at")
  firstResponseAt   DateTime?  @map("first_response_at")
  closedAt          DateTime?  @map("closed_at")
  closeReason       String?    @map("close_reason")
  createdAt         DateTime   @default(now()) @map("created_at")
  updatedAt         DateTime   @updatedAt @map("updated_at")
  deletedAt         DateTime?  @map("deleted_at")
  createdBy         String?    @map("created_by") @db.Uuid
  updatedBy         String?    @map("updated_by") @db.Uuid

  @@index([status])
  @@index([responsibleUserId])
  @@index([clientId])
  @@index([receivedAt])
  @@index([deletedAt])
  @@index([source])
  @@index([city])
  @@map("leads")
}
```

5. Create SQL migration with enum, table, indexes, and foreign keys matching the Prisma model.
6. Add seed permissions:

```ts
['leads.view', 'Просмотр лидов'],
['leads.create', 'Создание лидов'],
['leads.update', 'Редактирование лидов'],
['leads.delete', 'Удаление лидов'],
['leads.assign', 'Назначение лидов'],
['leads.convert', 'Конвертация лидов']
```

7. Assign all lead permissions to owner/admin via the existing all-permissions loop.
8. Add manager_head permissions: `leads.view`, `leads.create`, `leads.update`, `leads.assign`, `leads.convert`.
9. Add manager permissions: `leads.view`, `leads.create`, `leads.update`, `leads.convert`.
10. Run:

```powershell
$env:DATABASE_URL='postgresql://crm:crm@localhost:5432/crm?schema=public'; npm.cmd exec -w @crm/api -- prisma validate
$env:DATABASE_URL='postgresql://crm:crm@localhost:5432/crm?schema=public'; npm.cmd run prisma:generate -w @crm/api
```

Expected: Prisma schema validates and client generates.

11. Commit:

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260516010000_leads/migration.sql apps/api/prisma/seed.ts
git commit -m "feat: add leads prisma schema"
git push origin codex/stage-0-1
```

## Task 2: Backend DTOs and Failing Service Tests

**Files:**

- Create: `apps/api/src/leads/dto/create-lead.dto.ts`
- Create: `apps/api/src/leads/dto/update-lead.dto.ts`
- Create: `apps/api/src/leads/dto/lead-query.dto.ts`
- Create: `apps/api/src/leads/dto/assign-lead.dto.ts`
- Create: `apps/api/src/leads/dto/close-lead.dto.ts`
- Create: `apps/api/src/leads/dto/convert-lead.dto.ts`
- Create: `apps/api/src/leads/leads.service.spec.ts`

Steps:

1. Add DTOs using `class-validator` and Prisma enum `LeadStatus`.
2. Write failing tests for:
   - creating a lead writes `lead.create` audit and defaults status from assignment;
   - manager list is scoped to assigned or self-created leads;
   - owner search matches contact/source fields and overdue filter;
   - assignment sets responsible user, status, first response time, and audit;
   - close sets status `closed`, `closedAt`, `closeReason`, and audit;
   - conversion creates a client with phone/email/Telegram contacts and marks lead converted;
   - deal conversion returns not implemented.
3. Run:

```powershell
npm.cmd run test -w @crm/api -- leads.service.spec.ts
```

Expected before implementation: tests fail because `LeadsService` does not exist.

4. Do not commit this red test by itself unless pausing the session. Continue to Task 3.

## Task 3: Backend Leads Module

**Files:**

- Create: `apps/api/src/leads/leads.module.ts`
- Create: `apps/api/src/leads/leads.controller.ts`
- Create: `apps/api/src/leads/leads.service.ts`
- Modify: `apps/api/src/app.module.ts`

Steps:

1. Implement `LeadsService` methods:
   - `list(query, actor)`
   - `findById(id, actor)`
   - `create(dto, actor, context)`
   - `update(id, dto, actor, context)`
   - `assign(id, dto, actor, context)`
   - `close(id, dto, actor, context)`
   - `convertToClient(id, dto, actor, context)`
   - `convertToDeal()`
   - `history(id, actor)`
2. Implement visibility:
   - owner/admin/manager_head see all leads;
   - others see leads where `responsibleUserId = actor.id` or `createdBy = actor.id`;
   - hidden leads return `NotFoundException`.
3. Implement overdue filter:

```ts
receivedAt <= new Date(Date.now() - 15 * 60 * 1000)
firstResponseAt: null
status: { in: ['new', 'assigned'] }
```

4. Implement conversion to client using `prisma.$transaction`:
   - create or link `Client`;
   - create available phone/email/Telegram `ClientContact` rows for new clients;
   - update lead to `converted`;
   - write `lead.convert_to_client` audit.
5. Implement `LeadsController` with `JwtAuthGuard`, `PermissionsGuard`, and route permissions.
6. Wire `LeadsModule` into `AppModule`.
7. Run:

```powershell
npm.cmd run test -w @crm/api -- leads.service.spec.ts
```

Expected: leads tests pass.

8. Run:

```powershell
npm.cmd run test -w @crm/api
npm.cmd run build -w @crm/api
```

Expected: all backend tests and API build pass.

9. Commit:

```powershell
git add apps/api/src/leads apps/api/src/app.module.ts
git commit -m "feat: add leads backend api"
git push origin codex/stage-0-1
```

## Task 4: Frontend API Client

**Files:**

- Modify: `apps/web/src/lib/api.ts`

Steps:

1. Add types:
   - `LeadStatus`
   - `LeadRow`
   - `LeadDetail`
   - `LeadFilters`
   - `LeadPayload`
   - `LeadHistoryItem`
2. Add helpers:
   - `fetchLeads`
   - `fetchLead`
   - `createLead`
   - `updateLead`
   - `assignLead`
   - `closeLead`
   - `convertLeadToClient`
   - `convertLeadToDeal`
   - `fetchLeadHistory`
3. Use the existing `apiRequest` helper and `URLSearchParams` pattern from clients.

## Task 5: Frontend Leads Screens

**Files:**

- Modify: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/app/leads/page.tsx`
- Create: `apps/web/src/app/leads/new/page.tsx`
- Create: `apps/web/src/app/leads/[id]/page.tsx`
- Modify: `apps/web/src/app/globals.css`

Steps:

1. Add `Лиды` to sidebar navigation.
2. Add `/leads` title handling in `AppShell`.
3. Build `/leads` list:
   - filters: search, status, source, city, responsible, overdue;
   - columns: received time, status, contact, phone/email/Telegram, source/site, city, interest, responsible, overdue marker;
   - create link to `/leads/new`.
4. Build `/leads/new` manual create form:
   - contact fields;
   - source fields;
   - message/interest;
   - optional responsible user selector.
5. Build `/leads/[id]` card:
   - overview edit form;
   - assignment controls;
   - status controls;
   - close form;
   - convert-to-client button;
   - convert-to-deal placeholder button that shows backend message;
   - linked client panel;
   - history list.
6. Add CSS only where the existing clients styles are insufficient; reuse existing `.form-grid`, `.detail-grid`, `.tabs`, and `.status` classes.
7. Run:

```powershell
npm.cmd run build -w @crm/web
```

Expected: Web build passes and routes include `/leads`, `/leads/new`, `/leads/[id]`.

8. Commit:

```powershell
git add apps/web/src/lib/api.ts apps/web/src/components/app-shell.tsx apps/web/src/app/leads apps/web/src/app/globals.css
git commit -m "feat: add leads frontend screens"
git push origin codex/stage-0-1
```

## Task 6: Docs, Handoff, and Root Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/HANDOFF_2026-05-14.md`

Steps:

1. Update README with the leads module and internal-only webhook note.
2. Update handoff with:
   - leads design and plan paths;
   - commits;
   - local verification;
   - deployment checklist.
3. Run:

```powershell
git diff --check
npm.cmd run test
npm.cmd run build
```

Expected: no whitespace errors; backend tests pass; API and Web builds pass.

4. Commit:

```powershell
git add README.md docs/HANDOFF_2026-05-14.md
git commit -m "docs: update leads stage handoff"
git push origin codex/stage-0-1
```

## Task 7: VPS Deploy and Smoke Test

**Files:**

- Modify: `docs/HANDOFF_2026-05-14.md` after deployment result is known.

Steps:

1. On VPS:

```bash
cd /opt/crm
git pull --ff-only
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production -f docker-compose.prod.yml build api --progress plain
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production -f docker-compose.prod.yml build web --progress plain
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api npm run prisma:seed
```

2. Smoke-test:
   - `GET http://213.109.202.45/api/health`
   - owner login through API without printing tokens;
   - create lead through API;
   - assign lead;
   - convert lead to client;
   - verify `GET /leads` and `GET /leads/:id` web routes return `200`.
3. Archive or close smoke lead/client if needed.
4. Update handoff with VPS results and no secrets.
5. Run:

```powershell
git diff --check
```

6. Commit and push:

```powershell
git add docs/HANDOFF_2026-05-14.md
git commit -m "docs: record leads stage deployment"
git push origin codex/stage-0-1
```

## Self-Review

- Spec coverage: all Stage 3 internal lead requirements are covered: CRUD, statuses, assignment, conversion to client, 15-minute overdue foundation, notifications foundation, RBAC, UI, audit, and VPS smoke tests.
- Explicit exclusions: public webhook, Telegram delivery, and real deal creation are kept outside this stage.
- Type consistency: `LeadStatus`, `Lead`, `responsibleUserId`, `clientId`, `dealId`, and route names are consistent across schema, API, and frontend tasks.
- Verification: every implementation task has a concrete command and expected result; backend behavior uses red/green service tests before production code.
