# Модуль questions

## Назначение

Вопросы квиза с устойчивым порядком.

## Данные и правила

`Question`: `id`, `gameId`, `order` (unique `(gameId, order)`), `text`, `img`.
`order` назначает сервер при создании (max+1); пустой `text` допустим —
вопрос-плейсхолдер редактора.

## Интерфейсы

- `GET /api/questions?gameId=` — список вопросов игры владельца, по `order`.
- `POST /api/questions` `{gameId, text, img?}` — создать.
- `GET/PUT/DELETE /api/questions/:id` — только владелец игры.

## Зависимости

`PrismaService`, `AuthGuard`. Проверка владения — через `game.adminId`.

## Ошибки

403 — чужая игра; 404 — нет вопроса/игры; 400 — невалидный DTO
(`forbidNonWhitelisted`).

## Тесты

E2e: добавление/редактирование/удаление вопроса, валидация формы.
