# Развёртывание

## Docker

`Dockerfile` — multi-stage: deps → builder (`prisma generate` + `nest build`) →
runner (non-root `app`, только `node_modules`, `.prisma`, `prisma/`, `dist/`).
`.env*` исключены `.dockerignore` — секретов в образе нет.

```bash
docker build -t clone-kahoot-backend .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e ALLOWED_ORIGINS=https://your-frontend.example \
  clone-kahoot-backend
```

Проверено: образ собирается, контейнер отвечает на `/api/health/ready`,
SIGTERM → graceful shutdown (таймаут 10 с в `main.ts`).

## Amvera

- `amvera.yml` — конфигурация площадки (сборка из Dockerfile).
- Production-переменные — через секреты площадки: `DATABASE_URL`,
  `ALLOWED_ORIGINS=https://dimetriyo.github.io`, `TRUST_PROXY=true`
  (за прокси), `NODE_ENV=production`.
- Миграции: `yarn prisma-migrate-prod` (`migrate deploy`) — отдельным шагом,
  не при старте приложения.
- Health checks: `/api/health/live` (процесс жив), `/api/health/ready`
  (доступна БД) — использовать как liveness/readiness.
- OpenAPI UI отключён в production; `/api/openapi.json` остаётся доступным.

## PostgreSQL на Amvera

- Выделенный PostgreSQL (managed или контейнер); DSN — только в секретах.
- Резервное копирование: ежедневный `pg_dump` + проверка восстановления
  (`pg_restore` в staging-пустую БД) — настроить на площадке; автоматика
  пока не реализована.

## Замечания

- Комнаты игр — in-memory: при деплое/рестарте активные игры завершаются
  (клиенты получают `END_GAME`/disconnect). Несколько реплик не поддерживаются —
  балансировка только с одним инстансом.
