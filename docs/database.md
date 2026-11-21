# База данных

PostgreSQL + Prisma. Схема: `prisma/schema.prisma`, миграции: `prisma/migrations/`.

## Модель

```text
User ─┬─< Session        (сессии: хеш токена, expiresAt, revokedAt)
User ─┬─< GameSession ─┬─< SessionQuestion ─┬─< SessionAnswer
      │                └─< SessionPlayer ────┘   (история игр: копии названия и вопросов; Game → SetNull при удалении квиза)
      └─< Game ──< Question ──< AcceptedAnswer
```

- `User`: `id`, `name` (unique + функциональный unique `lower(name)` — регистронезависимо,
  CHECK непустой), `passwordHash` (scrypt), timestamps.
- `Session`: `id`, `tokenHash` (unique), `userId` → cascade, `createdAt`,
  `expiresAt`, `revokedAt` (nullable). Сам токен в БД не хранится.
- `Game`: `id`, `adminId` → `User` cascade, `title` (`VarChar(80)`, обязательное —
  существующие строки добиты «Quiz #N»), `createdAt`, `updatedAt` (`@updatedAt`;
  сервис трогает его и при изменениях вопросов/ответов — BR-45).
- `Question`: `id`, `gameId` → cascade, `order`, `text` (`VarChar(300)`), `img`, `timeLimitSec` (`SmallInt`, CHECK ∈ {10,20,30,60,90,120}, default 20)
  (nullable); unique `(gameId, order)`. Пустой `text` допускается — редактор
  создаёт вопрос-плейсхолдер (миграция `20261119123000`).
- `AcceptedAnswer`: `id`, `questionId` → cascade, `text` (`VarChar(100)`,
  CHECK непустой).

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

## История игр (этап 5)

- `GameSession`: `id` (= sessionId сеанса), `gameId` → `Game` SetNull (удаление квиза не трогает историю), `hostId` → `User` cascade, `quizTitle` (копия на момент игры), `status` (`running`/`finished`/`aborted`; при старте процесса `running` → `aborted` — NFR-R7), `startedAt`, `endedAt`.
- `SessionQuestion`: полный снапшот вопроса на момент игры — `position`, `text`, `img`, `timeLimitSec`, `acceptedAnswers` (JSON-массив).
- `SessionPlayer`: `userId` → `User` cascade, `nickname`, `color`, итоговые `score`, `correctCount`, `correctTimeMs`, `place` (записывается при завершении).
- `SessionAnswer`: ответ игрока на вопрос — `text`, `isCorrect`, `responseTimeMs`, `points`; пишется при закрытии каждого вопроса (NFR-R6).
