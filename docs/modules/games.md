# Модуль games

## Назначение

Квизы пользователя (наборы вопросов).

## Данные и правила

`Game`: `id`, `adminId` → `User` cascade, `title` (`VarChar(80)`, обязательное,
1–80 после trim — BR-44), `createdAt`, `updatedAt` (`@updatedAt`; обновляется
также при правках вопросов, ответов и вариантов — BR-45). Владелец — только из
сессии.

## Интерфейсы

- `GET /api/games` — список своих игр `{id, title, questionCount, updatedAt}`,
  сортировка по `updatedAt desc`.
- `POST /api/games` `{title}` — создать игру (владелец = текущий пользователь).
- `GET /api/games/:id` — только владелец (404 чужая).
- `PATCH /api/games/:id` `{title}` — переименование.
- `PATCH /api/games/:id/questions/reorder` `{questionIds}` — перестановка
  вопросов; массив обязан быть перестановкой текущих id.
- `DELETE /api/games/:id` — только владелец; каскадно удаляет вопросы, ответы
  и варианты.
- `POST /api/games/:id/sessions` — создать сеанс (лобби) — см.
  [active-game.md](active-game.md).

Изменяющие операции отклоняются 409, пока по квизу идёт живой сеанс
(`assertQuizEditable`, BR-54).

## Зависимости

`PrismaService`, `AuthGuard`, `ActiveGameService` (проверка идущего сеанса).

## Транзакции

Удаление игры каскадно удаляет вопросы, принимаемые ответы и варианты
(FK cascade); записи истории (`GameSession`) сохраняются — `gameId` → NULL.

## Тесты

E2e: создание с названием, переименование, список только своих игр, удаление с
подтверждением (`frontend/e2e/games.e2e.ts`).
