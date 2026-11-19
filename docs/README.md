# Документация бэкенда

Модульный монолит на NestJS: REST API (`/api`), игровой WebSocket (`/ws`), PostgreSQL + Prisma.

- [architecture.md](architecture.md) — структура модулей и ключевые решения.
- [development.md](development.md) — запуск с нуля, команды, переменные окружения.
- [database.md](database.md) — схема, ограничения, миграции, seed.
- [authentication.md](authentication.md) — сессии, Bearer-токен, WS-билеты.
- [api.md](api.md) — HTTP-конвенции и OpenAPI.
- [websocket-protocol.md](websocket-protocol.md) — события, payload, ошибки.
- [testing.md](testing.md) — уровни тестов и тестовая БД.
- [deployment.md](deployment.md) — Docker, Amvera, миграции, бэкапы.
- [refactoring-plan.md](refactoring-plan.md) / [refactoring-checklist.md](refactoring-checklist.md) — план и прогресс миграции.

## Модули

- [modules/auth.md](modules/auth.md) — регистрация, вход, сессии, WS-билеты.
- [modules/users.md](modules/users.md) — профили пользователей.
- [modules/games.md](modules/games.md) — квизы пользователя.
- [modules/questions.md](modules/questions.md) — вопросы квиза.
- [modules/accepted-answers.md](modules/accepted-answers.md) — принимаемые ответы.
- [modules/active-game.md](modules/active-game.md) — живые комнаты и WebSocket.
- [modules/health.md](modules/health.md) — liveness/readiness.
