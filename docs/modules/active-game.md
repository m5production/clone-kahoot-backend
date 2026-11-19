# Модуль active-game

## Назначение

Живые игровые комнаты: HTTP-проверка запущенности + WebSocket-протокол игры.

## Данные и правила

Состояние — в памяти: `Map<gameId, Room>` (`ActiveGameService`). Комната:
сокет ведущего, вопросы (из БД при старте), принимаемые ответы
`Map<questionId, Set<text>>`, игроки `Map<userId, PlayerState>`,
`sockets` с ролями. Рестарт теряет комнаты и результаты.

## Интерфейсы

- `GET /api/active-game/:id` — Bearer; 200 `{running:true}` или 404.
- `WebSocket /ws?ticket=` — протокол в [../websocket-protocol.md](../websocket-protocol.md).

## Зависимости

`PrismaService` (проверка игры/владельца, имя игрока), `AuthService` (билеты),
`ConfigService` (origin). `ActiveGameGateway` — только приём событий и делегирование.

## Сценарии

START_GAME (проверка владельца, загрузка вопросов) → комната;
PLAYER_CONNECTED → игрок в комнате (реконнект сохраняет ответы);
CHANGE_QUESTION / ANSWER_QUESTION / SHOW_ANSWERS / SHOW_WINNERS / END_GAME —
роли и бизнес-правила в сервисе; отключение ведущего → `endRoom`.

## Доступ / ошибки

Хост-команды только от `hostSocket`; ответ — только игрок, активный вопрос,
один раз. Все ошибки — `FAULT {code,message}` отправителю, без исключений
наружу; битый JSON и неизвестные события — контролируемый FAULT.
Анти-чит: `GAME_DATA` без текста/оценок ответов.

## Тесты

Unit `test/active-game.service.test.ts`: владелец, ответы, отключения,
изоляция комнат, `END_GAME` только ведущим. E2e: полный цикл игры.
