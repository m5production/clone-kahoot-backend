# Тестирование

| Уровень | Где | Запуск | БД |
| --- | --- | --- | --- |
| Unit (backend) | `test/*.test.ts` — конфиг, пароль, игровой сервис (подмена Prisma) | `yarn test` | не нужна |
| Contract smoke | `src/contracts.test.ts` (node:test) | в `yarn test` | подмена Prisma |
| Unit/component (frontend) | `*.unit.spec.ts`, `*.browser.spec.tsx` | `bun run test` | — |
| E2E (полный цикл) | `frontend/e2e` — Playwright | `bun run test:e2e` | PostgreSQL `clone_kahoot_e2e` |

## Принципы

- Интеграционные проверки — только против **PostgreSQL**, никогда SQLite.
- E2E-процесс: Playwright поднимает собранный бэкенд (`npx tsc && node dist/main.js`,
  порт 3101, `NODE_ENV=test`, `DATABASE_URL` из `E2E_DATABASE_URL` или
  `postgresql://postgres:postgres@localhost:5432/clone_kahoot_e2e`) и Vite :5174.
  БД сбрасывается `migrate reset` каждым запуском — не направлять на рабочую БД.
- `NODE_ENV=test` отключает in-memory rate limit (много регистраций с одного IP).
- Не запускать src через `tsx` — DI не работает без decorator metadata;
  только собранный `dist/` или `nest start`.

## Покрытие

- backend unit: конфиг-валидация, scrypt-пароль, игровой сервис — роли, один
  ответ на вопрос, отключения, изоляция комнат, завершение игры.
- frontend: 74 unit/component-теста.
- e2e: 19 тестов — регистрация/вход/выход, напоминание сессии, CRUD квизов и
  вопросов, полный live-цикл (ведущий + 2 игрока), вторая игра без перезагрузки,
  завершение при уходе ведущего, отказ во входе в незапущенную игру.

Не покрыто: откат транзакции replace-ответов (реализован `$transaction`),
истечение TTL сессии, конкурентные запуски одной игры (только unit).
