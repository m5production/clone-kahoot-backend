# Модуль options

## Назначение

Варианты ответа вопросов типа `choice` (спецификация — документ 13
продуктового репозитория): 2–4 варианта, ровно один верный (BR-86).

## Данные и правила

`QuestionOption`: `id`, `questionId` → cascade, `order` (порядок показа — D-13,
без перемешивания), `text` (`VarChar(100)`, непустой), `isCorrect`; unique
`(questionId, order)`.

Валидация набора — `assertValidOptions` (`options.util.ts`): от 2 до 4 вариантов,
`text` непустой после trim, без дублей после нормализации (BR-64), ровно один
`isCorrect`. Вопрос хранит только данные своего типа (D-12): записать варианты
можно лишь в вопрос `choice`, иначе 400.

## Интерфейсы

- `GET /api/options?questionId=` — варианты вопроса владельца по `order`.
- `PUT /api/options?questionId=` — **транзакционная** замена всего набора
  `[{text, isCorrect}]` (`deleteMany` + `createManyAndReturn` в `$transaction`),
  зеркало `PUT /accepted-answers`; обновляет `Game.updatedAt`.

`questionId` — только query-параметр; в body его подставить нельзя.

## Зависимости

`PrismaService`, `GamesService` (владение через `question.game.adminId`),
`ActiveGameService` (`assertQuizEditable` — 409, пока по квизу идёт сеанс).

## Тесты

Unit: `test/options-validation.test.ts`. E2e: редактор и живая игра
(`frontend/e2e/questions.e2e.ts`, `live-game/choice-question.e2e.ts`).
