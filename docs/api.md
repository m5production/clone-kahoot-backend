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
| GET/POST | `/questions(?gameId=)` | Bearer | список по игре (с `answersCount`, `optionsCount`, `type`), создание (order вычисляется); `text` ≤ 300; `timeLimitSec` ∈ {10,20,30,60,90,120}, по умолчанию 20 (BR-48) |
| GET/PUT/DELETE | `/questions/:id` | Bearer | только владелец игры; PUT принимает `text`, `img`, `timeLimitSec`, `type` ∈ {open,choice}; смена `type` удаляет набор другого типа (D-12) |
| GET/POST/PUT/DELETE | `/accepted-answers(?questionId=)` | Bearer | ответы `open`-вопроса, `text` ≤ 100; POST/PUT — 1–10 штук без дублей после нормализации; PUT — транзакционная замена `[{text}]` |
| GET/PUT | `/options(?questionId=)` | Bearer | варианты `choice`-вопроса; PUT — транзакционная замена `[{text, isCorrect}]`: 2–4 штуки, `text` ≤ 100, без дублей, ровно один верный (BR-86) |
| POST | `/games/:id/sessions` | Bearer | только владелец; создать сеанс (лобби) → `{sessionId, joinPath}`; 409 с полем `sessionId` существующего сеанса, если он уже идёт |
| GET | `/sessions/:id` | Bearer | публичное описание сеанса `{state, quizTitle, hostName}` для входа по ссылке; 410 — сеанс завершён |
| GET | `/sessions(?gameId=)` | Bearer | история ведущего, новые сверху: `{id, gameId, quizTitle, status, startedAt, endedAt, playerCount, winner}`; `gameId` — фильтр по квизу (FR-80, FR-83) |
| GET | `/sessions/:id/report` | Bearer | только ведущий сеанса: `{quizTitle, status, startedAt, endedAt, standings, questions[…,answers]}` — итог и разбор по вопросам (FR-81); чужой/живой сеанс → 404 |
| DELETE | `/sessions/:id` | Bearer | только ведущий; удаляет запись истории → 204 (FR-82, BR-82); живой сеанс → 409 |
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
