# База данных

PostgreSQL + Prisma. Схема: `prisma/schema.prisma`, миграции: `prisma/migrations/`.

## Модель

```text
User ─┬─< Session        (сессии: хеш токена, expiresAt, revokedAt)
      └─< Game ──< Question ──< AcceptedAnswer
```

- `User`: `id`, `name` (unique, CHECK непустой), `passwordHash` (scrypt), timestamps.
- `Session`: `id`, `tokenHash` (unique), `userId` → cascade, `createdAt`,
  `expiresAt`, `revokedAt` (nullable). Сам токен в БД не хранится.
- `Game`: `id`, `adminId` → `User` cascade, `createdAt`.
- `Question`: `id`, `gameId` → cascade, `order`, `text`, `img` (nullable);
  unique `(gameId, order)`. Пустой `text` допускается — редактор создаёт
  вопрос-плейсхолдер (миграция `20261119123000`).
- `AcceptedAnswer`: `id`, `questionId` → cascade, `text` (CHECK непустой).

Удаление пользователя каскадно удаляет его игры, вопросы и ответы.

## Миграции

- Dev: `yarn prisma-migrate-dev` (`migrate dev`, создаёт новые миграции).
- Prod/CI: `yarn prisma-migrate-prod` (`migrate deploy`, только применение).
- Никогда не сбрасывать существующую БД без отдельного подтверждения.

## Seed

`yarn prisma-seed-dev` — идемпотентный: пользователи `host`/`player`
(пароль `password`, scrypt-хеш), демо-игра `dev-seed-game`. Без production-секретов.

## Локальные БД

`docker-compose.yml`: `postgres` (:5432, volume) — `clone_kahoot_dev`;
`postgres-test` (:5433, tmpfs) — `clone_kahoot_test`. E2E фронтенда использует
отдельную `clone_kahoot_e2e` на :5432 и сбрасывает её каждым запуском.
