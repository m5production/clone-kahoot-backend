# WebSocket-протокол

Точка подключения: `ws://host/ws?ticket=<ticket>` (билет из `POST /api/auth/ws-ticket`).
Формат всех сообщений: `{"type": "<EVENT>", "payload": {...} | null}`, JSON ≤ 16 КБ.
Heartbeat: серверный ping каждые 30 с; без pong — terminate.

## События клиента → сервер

| type | payload | Кто | Эффект |
| --- | --- | --- | --- |
| `START_GAME` | `{gameId}` | владелец игры | создать комнату; ответ `GAME_DATA` |
| `PLAYER_CONNECTED` | `{gameId}` | любой юзер | войти/переподключиться в комнату → `GAME_DATA` всем |
| `CHANGE_QUESTION` | `{questionId}` | ведущий | активный вопрос → `GAME_DATA` всем |
| `ANSWER_QUESTION` | `{questionId, answer}` | игрок | фиксирует ответ (1 раз, только активный) → `GAME_DATA` всем |
| `SHOW_ANSWERS` | `{questionId}` | ведущий | `SHOW_ANSWERS` всем с ответами игроков |
| `SHOW_WINNERS` | `null` | ведущий | `SHOW_WINNERS` всем со standings |
| `END_GAME` | `null` | ведущий | `END_GAME` всем, комната удаляется, сокеты закрываются |

Поле `payload.qusetionId` старого протокола исправлено на `questionId`.

## События сервера → клиентам

| type | payload |
| --- | --- |
| `GAME_DATA` | `{id, players: [{id,name,bgColor,connected,answers:[{questionId}]}], allQuestions: [{id,text,img}], activeQuestionId}` — без текстов и оценок ответов |
| `SHOW_ANSWERS` | `{answers: [{playerId, playerName, playerAnswer: {questionId, text|null, isCorrect}}]}` |
| `SHOW_WINNERS` | `{standings: [{id, name, score}]}` — отсортировано по score |
| `END_GAME` | `null` |
| `FAULT` | `{code, message}` — ответ только отправителю |

## FAULT-коды

`BAD_REQUEST` (битый JSON/невалидный payload/не тот вопрос),
`UNKNOWN_EVENT`, `UNAUTHORIZED` (нет сокета в комнате), `FORBIDDEN`
(не та роль), `NOT_FOUND`, `NOT_RUNNING`, `ALREADY_RUNNING`, `CONFLICT`
(повторный ответ), `INTERNAL_ERROR`.

## Жизненный цикл

1. Ведущий: ws-connect → `START_GAME {gameId}` → комната, активен первый
   вопрос по `order`.
2. Игроки: ws-connect → `PLAYER_CONNECTED {gameId}` → имя/цвет назначаются
   сервером; повторный вход того же userId = переподключение (ответы сохраняются).
3. Отключение игрока → `connected:false` в `GAME_DATA`; возврат → `true`.
4. Отключение ведущего → `END_GAME` всем, комната удаляется.
5. `END_GAME` / рестарт сервера → комната и результаты теряются (in-memory).

Несколько комнат изолированы: broadcast только по `room.sockets`.
