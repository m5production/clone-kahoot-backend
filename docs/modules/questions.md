# Модуль questions

## Назначение

Вопросы квиза с устойчивым порядком и типом ответа.

## Данные и правила

`Question`: `id`, `gameId`, `order` (unique `(gameId, order)`), `type`
(`open` | `choice`, по умолчанию `open` — D-10), `text` (`VarChar(300)`; пустой
допустим — вопрос-плейсхолдер редактора), `img`, `timeLimitSec` (`SmallInt`,
∈ {10,20,30,60,90,120}, по умолчанию 20 — BR-48). `order` назначает сервер при
создании (max+1); перестановка — `PATCH /games/:id/questions/reorder`.

Вопрос хранит только данные своего типа (D-12): смена `type` в `PUT`
транзакционно удаляет набор другого типа (принимаемые ответы ↔ варианты).

## Интерфейсы

- `GET /api/questions?gameId=` — список вопросов игры владельца по `order`, с
  `answersCount` и `optionsCount`.
- `POST /api/questions` `{gameId, text, img?, timeLimitSec?}` — создать.
- `GET/PUT/DELETE /api/questions/:id` — только владелец игры. PUT принимает
  `text`, `img`, `timeLimitSec`, `type`.

Принимаемые ответы `open`-вопроса — [accepted-answers.md](accepted-answers.md);
варианты `choice`-вопроса — [options.md](options.md). Изменения отклоняются 409,
пока по квизу идёт сеанс (`assertQuizEditable`).

## Зависимости

`PrismaService`, `GamesService` (проверка владения через `game.adminId`),
`ActiveGameService`, `AuthGuard`.

## Ошибки

403 — чужая игра; 404 — нет вопроса/игры; 400 — невалидный DTO
(`forbidNonWhitelisted`); 409 — идущий сеанс или конфликт `order` (предлагается
повторить).

## Тесты

Unit: `test/reorder-questions.test.ts`. E2e: добавление/редактирование/удаление
вопроса, порядок, тип `choice` (`frontend/e2e/questions.e2e.ts`).
