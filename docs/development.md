# Разработка

## Требования

- Node.js 22+, Yarn 1.22 (`npx yarn@1.22.22`).
- Docker (PostgreSQL) или внешний PostgreSQL.

## Запуск с нуля

```bash
yarn install --frozen-lockfile
yarn db:up                          # PostgreSQL :5432 (+ тестовый :5433 tmpfs)
yarn prisma-migrate-dev             # применить миграции к clone_kahoot_dev
yarn prisma-seed-dev                # опционально: host/player + демо-игра
yarn dev                            # http://localhost:3000/api, ws://localhost:3000/ws
```

OpenAPI UI: `http://localhost:3000/api/docs` (dev), схема — `/api/openapi.json`.

## Команды

| Команда | Назначение |
| --- | --- |
| `yarn dev` | `nest start --watch` через dotenvx (`.env.development`) |
| `yarn build` / `yarn start` | `nest build` → `node dist/main.js` |
| `yarn test` | unit-тесты (`tsx --test test/*.test.ts`) |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn lint` / `yarn lint:ci` / `yarn format` | Biome |
| `yarn db:up` | docker compose postgres + postgres-test |
| `yarn prisma-migrate-dev` | `prisma migrate dev` (создаёт миграции!) |
| `yarn prisma-migrate-prod` | `prisma migrate deploy` (только применение) |
| `yarn prisma-seed-dev` / `prisma-studio-dev` | seed / Prisma Studio |

Не использовать `tsx`/`node` напрямую на `src/` — без `emitDecoratorMetadata`
ломается DI.

## Переменные окружения

Валидируются при старте (`src/config/configuration.ts`):

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `NODE_ENV` | development | development \| test \| production |
| `HOST` / `PORT` | 0.0.0.0 / 3000 | bind |
| `DATABASE_URL` | — (required) | PostgreSQL DSN |
| `ALLOWED_ORIGINS` | — (required) | CORS + Origin для WS, через запятую |
| `TRUST_PROXY` | production: true | `trust proxy` за reverse proxy |
| `SESSION_TTL_SECONDS` | 604800 | TTL сессии (7 дней) |
| `WS_TICKET_TTL_SECONDS` | 30 | TTL одноразового WS-билета |
| `HTTP_BODY_LIMIT` | 64kb | лимит JSON body |
| `WS_PAYLOAD_LIMIT` | 16384 | лимит WS-сообщения (байт) |

При `NODE_ENV=test` in-memory rate limit отключён (e2e делает много запросов
с одного IP).
