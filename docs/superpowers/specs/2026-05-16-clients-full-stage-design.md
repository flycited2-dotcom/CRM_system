# Clients Full Stage Design

## Goal

Implement the full CRM clients stage from the project brief: client CRUD, client contacts, search, filters, client card, comments, files, and action history with backend RBAC and frontend screens.

## Source Requirements

This spec follows:

- `crm_project_docs/05_DATABASE_SCHEMA.md`: `clients` and `client_contacts`.
- `crm_project_docs/06_API_SPEC.md`: Clients API endpoints.
- `crm_project_docs/07_UI_UX_SPEC.md`: clients screen and client card.
- `crm_project_docs/08_DEVELOPMENT_ROADMAP.md`: stage 2 clients.
- `crm_project_docs/09_ACCEPTANCE_CHECKLIST.md`: client module acceptance checklist.

## Scope

Included:

- Client database model with type, status, company/person fields, legal fields, addresses, city, source, responsible user, comment, soft delete, and timestamps.
- Client contact model with contact type, value, primary flag, and comment.
- Client comment model for timeline notes.
- Client file model for uploaded file metadata and stored file path.
- Client history based on existing `ActivityLog` plus a client history endpoint.
- Backend endpoints:
  - `GET /clients`
  - `GET /clients/:id`
  - `POST /clients`
  - `PATCH /clients/:id`
  - `DELETE /clients/:id`
  - `POST /clients/:id/contacts`
  - `PATCH /clients/:id/contacts/:contactId`
  - `DELETE /clients/:id/contacts/:contactId`
  - `POST /clients/:id/comments`
  - `GET /clients/:id/comments`
  - `POST /clients/:id/files`
  - `GET /clients/:id/files`
  - `GET /clients/:id/history`
  - `GET /clients/:id/deals`
  - `GET /clients/:id/tasks`
  - `GET /clients/:id/offers`
  - `GET /clients/:id/messages`
- Frontend screens:
  - `/clients` table with search and filters.
  - `/clients/new` create form.
  - `/clients/[id]` card with tabs: overview, contacts, comments, files, history, deals, tasks, offers, messages.
- RBAC permissions: `clients.view`, `clients.create`, `clients.update`, `clients.delete`.
- Visibility rule: owner/admin/manager_head see all clients; manager sees only clients assigned to them; other roles need explicit permission and see only assigned clients until a separate access-expansion stage changes that rule.
- Audit events for create, update, delete, contact changes, comment creation, and file upload.
- Seed updates to create client permissions and assign them to owner/admin, and view/create/update permissions to manager_head/manager.
- VPS deployment update after verification.

Excluded from this stage:

- Real deals/tasks/offers/messages business modules. Their client-card endpoints return empty arrays until those modules exist.
- Excel import. The UI can reserve the action, but implementation waits until the client data model stabilizes.
- Antivirus scanning or cloud object storage. Files are stored on the API container filesystem under a mounted upload directory.

## Data Model

`Client`

- `id`: UUID.
- `type`: enum `individual` or `company`.
- `status`: enum `active`, `inactive`, `archived`.
- `name`: required.
- `inn`, `kpp`, `ogrn`: optional legal identifiers.
- `legalAddress`, `actualAddress`, `city`, `source`, `comment`: optional strings.
- `responsibleUserId`: optional user relation.
- `createdBy`, `updatedBy`: optional user ids.
- `createdAt`, `updatedAt`, `deletedAt`.
- Relations: contacts, comments, files, responsible user.

`ClientContact`

- `id`, `clientId`.
- `contactType`: enum `phone`, `email`, `telegram`, `max`, `whatsapp`, `other`.
- `value`: required.
- `isPrimary`: boolean.
- `comment`: optional.
- `createdAt`, `updatedAt`.

`ClientComment`

- `id`, `clientId`, `userId`.
- `text`: required.
- `createdAt`.

`ClientFile`

- `id`, `clientId`, `uploadedById`.
- `originalName`, `storedName`, `mimeType`, `size`, `storagePath`, `comment`.
- `createdAt`.

## Backend Design

The backend follows the existing `UsersModule` style:

- `ClientsController` handles auth guards, permissions, params, request context, and multipart upload.
- `ClientsService` owns visibility checks, validation, Prisma writes, and audit events.
- DTOs use `class-validator` and `PartialType`.
- Responses include responsible user summary and primary contacts for table rows.

Search/filter behavior:

- `search` matches client name, city, source, legal ids, and contact values.
- `type`, `status`, `responsibleUserId`, `source`, and `city` are optional filters.
- Results are sorted by `updatedAt desc`.

Error handling:

- Missing or hidden clients return `404`.
- Duplicate primary contact is prevented by service logic: when a contact is marked primary for a type, other contacts of that type on the same client become non-primary.
- Upload rejects empty files and files over the configured limit.

## Frontend Design

The UI stays consistent with the current operational style:

- Sidebar adds `Клиенты`.
- Topbar title supports the clients routes.
- `/clients` shows dense table rows with filters above the table.
- `/clients/new` shows a compact form for the core client fields and first contact.
- `/clients/[id]` shows a client card with tabs. Tabs for deals/tasks/offers/messages show empty-state panels until their modules are implemented, while overview, contacts, comments, files, and history are functional.
- Forms use the existing CSS system and avoid large marketing-style sections.

## File Storage

Uploads are stored in the API container under `CLIENT_UPLOAD_DIR`, defaulting to `/app/uploads/clients`. Production compose mounts a named volume at `/app/uploads` so files survive container recreation.

The API stores metadata in `client_files`. The first UI implementation lists files and metadata; direct download endpoint can be added in the same service if needed, but upload/list is required for acceptance.

## Verification

Local checks:

- Prisma validate and generate.
- Backend tests for client creation, visibility, contacts, comments, files, and history.
- `npm.cmd run test`.
- `npm.cmd run build`.
- `git diff --check`.

VPS checks after deployment:

- `git pull --ff-only`.
- Build API and web images.
- `docker compose up -d --no-build`.
- `prisma migrate deploy`.
- Seed.
- `GET http://213.109.202.45/api/health`.
- Owner login.
- `GET /clients`.
- Create client through API.
- Add contact, comment, and file metadata/upload.
- Open `/clients` and `/clients/:id`.

## Assumptions

- The current staging domain is still plain HTTP by IP.
- Owner credentials remain server-only and are not written to the repository.
- Full Stage 2 means all client functions listed in the roadmap/checklist, while dependent modules can only expose empty linked tabs until they are built.
