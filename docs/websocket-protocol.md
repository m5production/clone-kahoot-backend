# WebSocket-протокол

Точка подключения: `ws://host/ws?ticket=<ticket>` (билет из `POST /api/auth/ws-ticket`).
Формат всех сообщений: `{"type": "<EVENT>", "payload": {...} | null}`, JSON ≤ 16 КБ.
Heartbeat: серверный ping каждые 30 с; без pong — terminate.

Жизненный цикл сеанса: `POST /api/games/:id/sessions` создаёт лобби (см. `api.md`),
далее вся игра идёт по WS. Состояния: `lobby` → `question_open` → `question_closed` →
`answers_shown` → (следующий вопрос) → победители. Сеанс можно завершить из любого
состояния (BR-55).

## События клиента → сервер

| type | payload | Кто | Эффект |
| --- | --- | --- | --- |
| `JOIN_SESSION` | `{sessionId}` | любой юзер | вход/переподключение в сеанс (роль определяет сервер: владелец → ведущий) → `JOINED_SESSION` отправителю, `SESSION_STATE` всем |
| `START_GAME` | `null` | ведущий | из лобби в первый вопрос → `SESSION_STATE` всем |
| `NEXT_QUESTION` | `null` | ведущий | следующий по порядку вопрос из `answers_shown` (BR-60) → `SESSION_STATE` всем |
| `CLOSE_QUESTION` | `null` | ведущий | закрыть вопрос досрочно → `QUESTION_CLOSED` + `SESSION_STATE` всем |
| `SHOW_ANSWERS` | `null` | ведущий | из `question_closed` → `ANSWERS_REVEALED` + `SESSION_STATE` всем |
| `SHOW_WINNERS` | `null` | ведущий | после ответов на последний вопрос → `WINNERS` + `SESSION_ENDED` всем |
| `END_SESSION` | `null` | ведущий | досрочное завершение → `SESSION_ENDED` всем, комната удаляется |
| `ANSWER_QUESTION` | `{questionId, answer}` | игрок | ответ на открытый вопрос (1 раз, ≤100 символов, непустой после trim — BR-63; сравнение по нормализованной строке — BR-64) → `ANSWER_ACCEPTED` игроку, `SESSION_STATE` всем |

## События сервера → клиентам

| type | payload |
| --- | --- |
| `JOINED_SESSION` | `{role: "host"\|"player", sessionId}` — только отправителю JOIN_SESSION |
| `SESSION_STATE` | `{sessionId, gameId, quizTitle, state, hostConnected, players: [{id,name,bgColor,connected,answered}], question: {id,text,img,number,total} \| null}` — без текстов и оценок ответов; `question: null` в лобби |
| `ANSWER_ACCEPTED` | `{questionId, text}` — только ответившему игроку |
| `QUESTION_CLOSED` | `{questionId}` — всем; в т.ч. при автозакрытии, когда ответили все игроки в сети (BR-61) |
| `ANSWERS_REVEALED` | `{questionId, acceptedAnswers: [string], answers: [{playerId,playerName,text\|null,isCorrect}]}` |
| `WINNERS` | `{standings: [{id,name,score}]}` — отсортировано по score |
| `SESSION_ENDED` | `{reason: "finished" \| "host_ended" \| "host_timeout"}` |
| `FAULT` | `{code, message}` — ответ только отправителю |

## FAULT-коды

`BAD_REQUEST` (битый JSON/невалидный payload/действие не в том состоянии/пустой
ответ), `UNKNOWN_EVENT`, `UNAUTHORIZED` (нет тикета), `FORBIDDEN` (не та роль),
`NOT_FOUND` (нет такого сеанса или он завершён), `NOT_RUNNING` (не в сеансе),
`CONFLICT` (повторный ответ), `INTERNAL_ERROR`.

## Жизненный цикл

1. Ведущий: `POST /api/games/:id/sessions` → `{sessionId, joinPath}` → ws-connect →
   `JOIN_SESSION {sessionId}` → лобби. Игроки открывают `joinPath` на фронтенде,
   проходят `GET /api/sessions/:id` и так же шлют `JOIN_SESSION`.
2. Ведущий: `START_GAME` → вопрос 1; игроки отвечают `ANSWER_QUESTION`; вопрос
   закрывается при ответах всех игроков в сети или по `CLOSE_QUESTION` (BR-61).
3. Ведущий: `SHOW_ANSWERS` → `ANSWERS_REVEALED`; `NEXT_QUESTION` → следующий вопрос
   (строго по порядку, каждый играется один раз — BR-60).
4. После последнего вопроса: `SHOW_WINNERS` → `WINNERS` + `SESSION_ENDED {finished}`.
5. Отключение игрока → `connected:false`, ответы сохраняются (BR-58); отключение
   ведущего → `hostConnected:false`, комната живёт `HOST_GRACE_SECONDS` (5 мин);
   не вернулся → `SESSION_ENDED {host_timeout}` (BR-59).
6. `END_SESSION` / таймаут ведущего → `SESSION_ENDED`, комната удаляется;
   `GET /api/sessions/:id` после этого отвечает 410.

Несколько комнат изолированы: broadcast только по `room.sockets`. Комнаты в памяти —
рестарт сервера завершает все сеансы.
