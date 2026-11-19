# Модуль auth

## Назначение

Регистрация, вход, выход, сессии, одноразовые WS-билеты.

## Данные и правила

- `Session`: `tokenHash` (sha256 токена), `expiresAt`, `revokedAt`; каскад с `User`.
- Пароль — scrypt (`password.util.ts`), в ответах не возвращается.
- Токен выдаётся один раз в ответе; в БД — только хеш.

## Интерфейсы

- `POST /api/users` → `{id,name,token}` (409 при занятом имени).
- `POST /api/users/auth` → `{id,name,token}` (401 при неверной паре).
- `GET /api/users/me`, `POST /api/users/logout` (204) — Bearer.
- `POST /api/auth/ws-ticket` → `{ticket}` — Bearer; TTL `WS_TICKET_TTL_SECONDS`,
  погашается при коннекте.
- `AuthGuard` — глобально используемый guard для Bearer-маршрутов.

## Зависимости

`PrismaService`, `ConfigService`. Guard используется другими модулями.

## Сценарии

Вход → создание `Session`; logout → `revokedAt`; истёкшие/отозванные
сессии отклоняются. WS-билет связан с userId и хранится в памяти.

## Доступ / ограничения

Rate limit на register/login (in-memory, per IP+path; off при NODE_ENV=test).

## Тесты

Unit: password hash/verify; e2e: регистрация, вход, выход, восстановление
сессии, отклонение чужого пароля.
