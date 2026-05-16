# Leads Stage Design

## Goal

Implement Stage 3 of the CRM roadmap: a complete internal leads module that captures incoming requests, lets managers process them, preserves assignment and action history, and converts qualified leads into clients. Deal conversion will expose the intended API contract but remain a guarded placeholder until the deals module exists.

## Source Requirements

This spec follows:

- `crm_project_docs/05_DATABASE_SCHEMA.md`: `leads` fields and links to clients/deals.
- `crm_project_docs/06_API_SPEC.md`: Leads API endpoints.
- `crm_project_docs/07_UI_UX_SPEC.md`: operational CRM screens and card patterns.
- `crm_project_docs/08_DEVELOPMENT_ROADMAP.md`: Stage 3 leads.
- `crm_project_docs/09_ACCEPTANCE_CHECKLIST.md`: leads acceptance checklist.

## Scope

Included:

- Lead database model with source, site, page URL, UTM fields, contact data, message, product interest, city, IP address, status, responsible user, client link, deal link placeholder, timestamps, and close reason.
- Backend `LeadsModule` with authenticated API:
  - `GET /leads`
  - `GET /leads/:id`
  - `POST /leads`
  - `PATCH /leads/:id`
  - `POST /leads/:id/assign`
  - `POST /leads/:id/convert-to-deal`
  - `POST /leads/:id/close`
- Frontend screens:
  - `/leads` list with search and filters.
  - `/leads/new` manual create form.
  - `/leads/[id]` lead card with overview, processing actions, history, and linked client/deal panel.
- RBAC permissions:
  - `leads.view`
  - `leads.create`
  - `leads.update`
  - `leads.delete`
  - `leads.assign`
  - `leads.convert`
- Visibility rule:
  - owner/admin/manager_head see all leads.
  - manager sees leads assigned to them and leads they created until assignment.
  - other roles need explicit permission and see only assigned leads.
- Audit events for create, update, assignment, close, and conversion.
- Conversion to client:
  - creates or links a client from lead contact data;
  - copies phone, email, and Telegram into client contacts;
  - stores `clientId` on the lead;
  - marks first response time if it was empty;
  - writes audit events.
- Deal conversion placeholder:
  - endpoint exists and returns a clear not-implemented response until Stage 4 deals exists.
  - no deal tables are added in this stage.
- 15-minute rule foundation:
  - list/filter exposes overdue unprocessed leads based on `receivedAt` and `firstResponseAt`;
  - backend has a query filter for overdue leads;
  - UI highlights leads that have no first response after 15 minutes.
- Notification foundation:
  - audit event is written for new unassigned lead and overdue detection;
  - real Telegram/email delivery waits for the notification and Telegram stages.

Excluded from this stage:

- Public site webhook API. The internal leads module must be stable before external intake is added.
- Telegram delivery and real push notifications.
- Full deals module and deal product model.
- Deduplication automation beyond manual close reason `duplicate`.

## Data Model

`Lead`

- `id`: UUID.
- `source`: optional string, e.g. `manual`, `site`, `phone`, `telegram`.
- `site`: optional source site name.
- `pageUrl`: optional page URL.
- `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`: optional UTM fields.
- `name`: optional contact name.
- `phone`, `email`, `telegram`: optional contact fields.
- `message`: optional request text.
- `productInterest`: optional product/service interest.
- `city`: optional city.
- `ipAddress`: optional request IP.
- `status`: enum:
  - `new`
  - `assigned`
  - `in_progress`
  - `converted`
  - `closed`
- `responsibleUserId`: optional user relation.
- `clientId`: optional relation to `Client`.
- `dealId`: optional UUID stored for future deal relation.
- `receivedAt`: timestamp, default now.
- `firstResponseAt`: optional timestamp.
- `closedAt`: optional timestamp.
- `closeReason`: optional string.
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`.

Indexes:

- `status`
- `responsible_user_id`
- `client_id`
- `received_at`
- `deleted_at`
- search-support indexes on key contact/source fields where useful.

## Backend Design

The module follows the current `ClientsModule` style:

- `LeadsController` owns routes, guards, permission decorators, and request context.
- `LeadsService` owns Prisma queries, visibility checks, status transitions, conversion, and audit events.
- DTOs use `class-validator`.

List/search behavior:

- `search` matches name, phone, email, Telegram, city, source, site, product interest, and message.
- Filters: `status`, `responsibleUserId`, `source`, `city`, `overdue`.
- Results sort by newest unprocessed work first: `receivedAt desc` by default.

Status behavior:

- Create defaults to `new` if no responsible user is set.
- Create defaults to `assigned` if a responsible user is set.
- Assign sets `responsibleUserId`, status `assigned` unless already `in_progress`, and sets `firstResponseAt` if empty.
- Update can move status between `new`, `assigned`, and `in_progress`.
- Close sets status `closed`, `closedAt`, and `closeReason`.
- Convert to client sets status `converted`, `clientId`, `firstResponseAt` if empty, and `closedAt`.

Conversion to client:

- If `clientId` is provided, the service links the lead to an existing visible client.
- Otherwise it creates a client using lead name or phone/email as fallback name.
- Contacts are created for available phone, email, and Telegram values.
- The created client is assigned to the same responsible user as the lead, falling back to the actor.

Error handling:

- Missing or hidden leads return `404`.
- Invalid status transitions return `400`.
- Conversion without enough identity/contact data returns `400`.
- Deal conversion returns `501` with a stable message until Stage 4.

## Frontend Design

The UI stays compact and operational like the clients module:

- Sidebar adds `Лиды`.
- Topbar title supports `/leads` routes.
- `/leads` shows table columns: received time, status, contact, phone/email/Telegram, source/site, city, product interest, responsible user, overdue marker.
- Filters: search, status, source, city, responsible user, overdue.
- `/leads/new` creates manual leads with contact/source fields and optional responsible user.
- `/leads/[id]` shows:
  - overview form;
  - assignment action;
  - status action;
  - close form with reason;
  - convert-to-client action;
  - deal conversion placeholder;
  - linked client panel;
  - activity history.

No marketing-style page is added; the list is the first screen.

## RBAC

Seed updates:

- owner/admin: all `leads.*` permissions.
- manager_head: `leads.view`, `leads.create`, `leads.update`, `leads.assign`, `leads.convert`.
- manager: `leads.view`, `leads.create`, `leads.update`, `leads.convert`.

Delete permission is reserved for owner/admin; normal close flow should use `POST /leads/:id/close`.

## Verification

Local checks:

- Prisma validate and generate.
- Red/green backend service tests for:
  - creating a lead writes audit;
  - manager list is scoped;
  - owner can search by contact/source fields;
  - assignment sets responsible user and first response time;
  - closing sets status/closedAt/closeReason and audit;
  - conversion creates or links a client and client contacts;
  - deal conversion returns not implemented.
- `npm.cmd run test -w @crm/api -- leads.service.spec.ts`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

VPS checks after deployment:

- `git pull --ff-only`
- build API and Web images sequentially;
- `docker compose up -d --no-build`;
- seed;
- `GET /api/health`;
- owner login;
- create lead through API;
- assign lead;
- convert lead to client;
- verify `/leads` and `/leads/:id` return `200`.

## Assumptions

- Stage 3 means internal lead management first; external site webhooks are Stage 9 in the roadmap and will be implemented after the lead core is stable.
- Real notification delivery waits for Telegram/notification stages. This stage records the events and highlights overdue leads in UI.
- Deal conversion cannot create a real deal until Stage 4 adds the deal model. The endpoint exists now to preserve API shape and will be completed later.
- The existing clients module is the source of truth for client creation and contact storage during conversion.

## Self-Review

- No placeholder requirements remain; deal conversion is explicitly scoped as a Stage 4 placeholder.
- Scope is limited to one module and does not pull in webhooks, Telegram, or deals.
- Data model fields match the original database schema.
- API routes match the original API spec.
- Acceptance coverage includes manual create, assignment, status change, conversion, duplicate/manual close, and overdue highlighting.
