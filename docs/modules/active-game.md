# Модуль active-game

## Назначение

Живые игровые сеансы: HTTP-создание сеанса, публичная сводка для страницы
входа и WebSocket-протокол игры.

## Данные и правила

Состояние — в памяти: `Map<sessionId, Room>` (`ActiveGameService`). Комната:
сокеты с ролями (`host`/`player`), вопросы со снапшотом ответов/вариантов,
игроки `Map<userId, PlayerState>`, таймер вопроса, grace-таймер ведущего
(`HOST_GRACE_SECONDS`, по умолчанию 300 с). Рестарт теряет идущие комнаты —
в истории они помечаются `aborted` (NFR-R7); результаты пишет модуль
`history` при закрытии каждого вопроса и завершении сеанса.

## Интерфейсы

- `POST /api/games/:id/sessions` — Bearer, только владелец; создаёт лобби →
  `{sessionId, joinPath}`; 409 с `sessionId` текущего сеанса, если он уже идёт
  (BR-51).
- `GET /api/sessions/:id` — Bearer; публичная сводка `{state, quizTitle,
  hostName}` для страницы `/join/:id`; 410 для завершённого сеанса (FR-73).
- `WebSocket /ws?ticket=` — протокол в [../websocket-protocol.md](../websocket-protocol.md).

## Зависимости

`PrismaService` (проверка игры/владельца, загрузка вопросов), `AuthService`
(WS-билеты), `ConfigService` (origin, grace), `HistoryService` (запись истории).
`ActiveGameGateway` — только приём событий и делегирование; `assertQuizEditable`
используется модулями games/questions/accepted-answers/options (409, пока по
квизу идёт сеанс).

## Сценарии

`POST /games/:id/sessions` → лобби → `JOIN_SESSION` → `START_GAME` → вопросы по
`NEXT_QUESTION`/`CLOSE_QUESTION`/`SHOW_ANSWERS` → `SHOW_WINNERS` →
`SESSION_ENDED`; `END_SESSION` — досрочно. Отключение игрока →
`connected:false`, ответы сохраняются (BR-58); отключение ведущего →
grace-таймер, по истечении `SESSION_ENDED {host_timeout}` (BR-59).

## Доступ / ошибки

Хост-команды — только от сокета с ролью `host`; ответ — только игрок, только
на активный вопрос, один раз. Все ошибки — `FAULT {code,message}` отправителю,
без исключений наружу; битый JSON и неизвестные события — контролируемый
FAULT. Rate-limit — 30 команд за 10 с на сокет (off при `NODE_ENV=test`).
Анти-чит: `SESSION_STATE` без текстов и оценок ответов, `isCorrect` вариантов
не отдаётся до `ANSWERS_REVEALED` (BR-88).

## Тесты

Unit `test/active-game.service.test.ts`: владелец, один ответ, отключения,
изоляция комнат, завершение по ролям. E2e: полный цикл игры
(`frontend/e2e/live-game/`).
