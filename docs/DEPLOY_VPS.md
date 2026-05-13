# VPS Deployment Guide

Этот документ описывает первый staging-деплой CRM на VPS. Цель этапа: проверить реальную серверную среду, вход в CRM, PostgreSQL, миграции, seed, API, Web и Nginx.

## 1. Требования к VPS

Минимум для первого staging:

- Ubuntu 22.04/24.04 или совместимый Linux.
- 2 CPU.
- 4 GB RAM.
- 30-50 GB SSD.
- Открыт порт `80`.
- Доступ по SSH.
- Установлены `git`, Docker и Docker Compose plugin.

Установка Docker на Ubuntu обычно выглядит так:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

После `usermod` нужно перелогиниться в SSH-сессию.

Проверка:

```bash
docker --version
docker compose version
```

## 2. Получить код

```bash
mkdir -p /opt/crm
cd /opt/crm
git clone https://github.com/flycited2-dotcom/CRM_system.git .
git checkout codex/stage-0-1
```

Для последующих обновлений:

```bash
cd /opt/crm
git pull --ff-only
```

## 3. Настроить production env

```bash
cp .env.production.example .env.production
nano .env.production
```

Обязательно заменить:

- `POSTGRES_PASSWORD`
- `DATABASE_URL` с тем же паролем PostgreSQL
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `OWNER_EMAIL`
- `OWNER_PASSWORD`
- `WEB_ORIGIN`

Для первого запуска без домена можно оставить:

```env
WEB_ORIGIN=http://SERVER_IP
NEXT_PUBLIC_API_URL=/api
```

Когда будет домен и HTTPS, `WEB_ORIGIN` нужно поменять на домен, например:

```env
WEB_ORIGIN=https://crm.example.com
```

## 4. Собрать и запустить контейнеры

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Проверка контейнеров:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Логи API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
```

## 5. Применить миграции и seed

Миграции применяются при старте `api` через `prisma migrate deploy`. Для ручной проверки:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api npm run prisma:deploy
```

Seed нужно выполнить один раз после первого запуска:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api npm run prisma:seed
```

Seed создает стартовые роли, permissions и owner-пользователя из `.env.production`.

## 6. Smoke checks

API health:

```bash
curl http://SERVER_IP/api/health
```

Ожидаемый ответ:

```json
{"status":"ok","service":"crm-api"}
```

Swagger:

```text
http://SERVER_IP/api/docs
```

Web:

```text
http://SERVER_IP
```

Проверить вручную:

- открывается страница входа;
- owner входит с `OWNER_EMAIL` / `OWNER_PASSWORD`;
- открывается рабочий стол;
- открывается экран сотрудников;
- logout завершает сессию.

## 7. Обновление после нового коммита

```bash
cd /opt/crm
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml exec api npm run prisma:deploy
```

Если seed изменился и нужно досоздать новые справочники:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api npm run prisma:seed
```

## 8. Rollback

Посмотреть историю:

```bash
git log --oneline -5
```

Откатиться к предыдущему коммиту:

```bash
git checkout COMMIT_HASH
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Миграции базы назад автоматически не откатываются. Перед этапами с изменением схемы БД нужно делать backup PostgreSQL.

## 9. Backup PostgreSQL

Пример backup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres pg_dump -U crm crm > crm_backup.sql
```

## 10. SSL и домен

Текущий compose открывает HTTP на порту `80`. Для staging этого достаточно. Для боевого доступа нужно добавить домен и SSL одним из вариантов:

- внешний Nginx на VPS + Certbot;
- Traefik/Caddy перед compose;
- расширить текущий Nginx контейнер сертификатами.

Перед включением HTTPS нужно обновить `WEB_ORIGIN` в `.env.production`.

## 11. Ограничения текущего этапа

- На локальной машине Docker не установлен, поэтому Docker build/compose проверяется документально и через обычные `npm` сборки.
- В CRM пока нет бизнес-модулей клиентов, лидов, сделок, задач и КП.
- Production compose предназначен для первого staging, а не для высокой нагрузки.
