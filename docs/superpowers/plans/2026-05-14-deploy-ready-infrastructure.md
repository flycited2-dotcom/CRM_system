# Deploy-Ready Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the CRM foundation for a first VPS staging deployment without adding business modules.

**Architecture:** Keep the deployment simple: PostgreSQL, Redis, API, Web, and Nginx run through a production Docker Compose file. The API owns migrations and seed commands through Prisma, the web app is served by Next.js standalone output, and Nginx exposes one HTTP entrypoint that proxies `/api` to NestJS and all other traffic to Next.js.

**Tech Stack:** Docker, Docker Compose, Nginx, NestJS, Next.js standalone output, Prisma migrations, PostgreSQL, Redis.

---

## Scope

This stage adds deployment artifacts only. It does not deploy to the VPS yet and does not add CRM modules such as clients, leads, deals, tasks, КП, Telegram, email, or reports.

## Files

- Create: `.dockerignore`
- Modify: `.gitignore`
- Create: `.env.production.example`
- Create: `docker-compose.prod.yml`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Modify: `apps/api/package.json`
- Modify: `apps/web/next.config.ts`
- Create: `deploy/nginx/crm.conf`
- Create: `docs/DEPLOY_VPS.md`
- Create: `apps/api/prisma/migrations/20260514000000_init/migration.sql`

## Tasks

### Task 1: Container Build Files

- [ ] Add `.dockerignore` so Docker contexts do not include `node_modules`, build output, git metadata, or secrets.
- [ ] Add API Dockerfile that installs workspace dependencies, generates Prisma Client, builds NestJS, and starts `dist/main.js`.
- [ ] Add Web Dockerfile that builds Next.js with `output: "standalone"` and starts the generated server.
- [ ] Run `npm.cmd run build` to verify the app still compiles outside Docker.

### Task 2: Production Compose and Nginx

- [ ] Add `.env.production.example` with non-secret placeholders and required keys.
- [ ] Add `docker-compose.prod.yml` with `postgres`, `redis`, `api`, `web`, and `nginx` services.
- [ ] Add `deploy/nginx/crm.conf` to proxy `/api` to `api:4000` and `/` to `web:3000`.
- [ ] Run `docker compose config` if Docker is available. If Docker is not available, document that verification is blocked by missing Docker.

### Task 3: Prisma Deployment Path

- [ ] Add `prisma:deploy` script for `prisma migrate deploy`.
- [ ] Commit the initial SQL migration so a clean VPS database can be created reproducibly.
- [ ] Document first-run commands for migration and seed.
- [ ] Run `npm.cmd run prisma:generate -w @crm/api` to verify Prisma artifacts.

### Task 4: VPS Handoff

- [ ] Add `docs/DEPLOY_VPS.md` with VPS prerequisites, clone/pull, env setup, compose startup, migration, seed, smoke checks, update flow, rollback notes, and known limits.
- [ ] Run `npm.cmd run test` and `npm.cmd run build`.
- [ ] Commit and push this stage.
