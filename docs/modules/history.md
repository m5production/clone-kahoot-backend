# Модуль history

## Назначение

История сыгранных сеансов: запись снапшотов во время игры и чтение
списка/отчёта ведущего.

## Данные и правила

- `GameSession`: `id` (= sessionId сеанса), `gameId` → `Game` SetNull
  (удаление квиза не трогает историю), `hostId`, `quizTitle` (копия на момент
  игры), `status` (`running`/`finished`/`aborted`), `startedAt`, `endedAt`.
- `SessionQuestion`: снапшот вопроса — `position`, `text`, `img`,
  `timeLimitSec`, `type`, `acceptedAnswers` (JSON), `options` (JSON для `choice`).
- `SessionPlayer`: `userId`, `nickname`, `color`, итоговые `score`,
  `correctCount`, `correctTimeMs`, `place`.
- `SessionAnswer`: `text`, `isCorrect`, `responseTimeMs`, `points`.

Запись: `startRecord` при создании сеанса (строка + снапшоты вопросов),
`recordQuestionClosed` при закрытии каждого вопроса (NFR-R6), `finishRecord`
при завершении (статус, `endedAt`, места). При старте процесса все строки
`running` помечаются `aborted` — рестарт роняет комнаты (NFR-R7).

## Интерфейсы

- `GET /api/sessions(?gameId=)` — история ведущего без живых сеансов, новые
  сверху: `{id, gameId, quizTitle, status, startedAt, endedAt, playerCount,
  winner}`; `gameId` — фильтр по квизу (FR-80, FR-83).
- `GET /api/sessions/:id/report` — только ведущий сеанса: `{quizTitle, status,
  startedAt, endedAt, standings, questions[…,answers]}` (FR-81); чужой или
  ещё идущий сеанс → 404 (BR-81).
- `DELETE /api/sessions/:id` — только ведущий → 204 (FR-82, BR-82).

## Зависимости

`PrismaService`; `AuthGuard` на контроллере. Пишется из `ActiveGameService`
во время игры — сам модуль игровой логики не содержит.

## Тесты

Unit: `test/history.service.test.ts`. E2e: страницы истории и отчёта
(`frontend/e2e/history.e2e.ts`).
