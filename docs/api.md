# HTTP API

Базовый префикс `/api`. Авторизация — `Authorization: Bearer <token>`
(см. [authentication.md](authentication.md)).

## OpenAPI

- Схема: `GET /api/openapi.json` (всегда).
- UI: `/api/docs` — только не-production.
- Генерируется `SwaggerModule` из контроллеров и DTO (плагин `@nestjs/swagger`
  в `nest-cli.json`). Ручное дублирование схем в документации не ведётся.

## Маршруты

| Метод | Путь | Доступ | Назначение |
| --- | --- | --- | --- |
| POST | `/users` | публичный | регистрация → `{id,name,token}` |
| POST | `/users/auth` | публичный | вход → `{id,name,token}` |
| GET | `/users/me` | Bearer | текущий пользователь |
| POST | `/users/logout` | Bearer | отзыв сессии → 204 |
| POST | `/auth/ws-ticket` | Bearer | одноразовый WS-билет |
| GET/PUT/DELETE | `/users/:id` | Bearer/публичный GET | профиль; изменения — только свои |
| GET/POST | `/games` | Bearer | список `{id,title,questionCount,updatedAt}` по `updatedAt desc`; создание `{title}` |
| GET/PATCH/DELETE | `/games/:id` | Bearer | только владелец; PATCH — переименование `{title}` |
| PATCH | `/games/:id/questions/reorder` | Bearer | перестановка вопросов `{questionIds}` — обязана быть перестановкой текущих id |
| GET/POST | `/questions(?gameId=)` | Bearer | список по игре (с `answersCount`), создание (order вычисляется); `text` ≤ 300 |
| GET/PUT/DELETE | `/questions/:id` | Bearer | только владелец игры |
| GET/POST/PUT/DELETE | `/accepted-answers(?questionId=)` | Bearer | ответы вопроса, `text` ≤ 100; POST/PUT — 1–10 штук без дублей после нормализации; PUT — транзакционная замена `[{text}]` |
| GET | `/active-game/:id` | Bearer | запущена ли комната |
| GET | `/health/live` `/health/ready` | публичный | probes |

## Ошибки

Все ошибки — `{code, message, requestId}`; `requestId` возвращается и в
заголовке `x-request-id`. Типовые коды: `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `TOO_MANY_REQUESTS`,
`INTERNAL_ERROR`.

## Креды (`POST /users`, `POST /users/auth`, `PUT /users/:id`)

- `name` — обрезается по краям, 3–20 символов; уникален без учёта регистра
  (конфликт → 409 `CONFLICT`).
- `password` — 8–128 символов.
- `POST /users/auth` отвечает одинаковым `401 Invalid name or password` и на
  неизвестное имя, и на неверный пароль.

## Отличия от старого Express-API (намеренные)

- Регистрация/вход возвращают `token`; cookie `authorization` больше нет.
- `GET /users/:id` не создаёт сессию.
- Создание игры/вопросов/ответов требует Bearer; владелец из сессии.
- У `Game` обязательный `title` (1–80, trim) и `updatedAt`, который обновляется
  и при изменениях вопросов/ответов квиза (BR-45).
- `AcceptedAnswer` в body — только `{text}`; `questionId` — query-параметр.
- `Question` имеет `order`; порядок меняется через `PATCH /games/:id/questions/reorder`.
