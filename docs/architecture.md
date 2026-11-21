# Архитектура

Модульный монолит на **NestJS 12** (Express-адаптер) + **Prisma/PostgreSQL** + **ws** для игры.
Один процесс, одна БД, состояние живых игр — в памяти процесса.

## Структура `src/`

```text
src/
├── main.ts                  # точка входа: listen + SIGTERM/SIGINT
├── bootstrap.ts             # создание приложения (используется и в тестах)
├── app.module.ts            # корневой модуль, request-id middleware
├── config/configuration.ts  # валидация env при старте
├── common/
│   ├── decorators/          # @CurrentUser
│   ├── filters/             # HttpExceptionFilter → {code,message,requestId}
│   ├── guards/              # AuthGuard (Bearer), RateLimit (in-memory)
│   └── middleware/          # requestId
├── database/                # PrismaModule/PrismaService (global)
└── modules/
    ├── auth/                # регистрация, вход, сессии, WS-билеты
    ├── users/               # публичные профили, update/delete себя
    ├── games/               # CRUD квизов владельца
    ├── questions/           # CRUD вопросов (order)
    ├── accepted-answers/    # транзакционная замена ответов open-вопросов
    ├── options/             # транзакционная замена вариантов choice-вопросов
    ├── active-game/         # сеансы в памяти + WS gateway + создание сеанса
    ├── history/             # история игр: снапшоты сеансов, список, отчёт
    └── health/              # /health/live, /health/ready
```

## Ключевые решения

- **Сессии вместо JWT**: непрозрачный токен → sha256-хеш в `Session`. Немедленный
  отзыв при выходе, нет подписей/refresh. Фронт и API на разных сайтах, поэтому
  токен передаётся через `Authorization: Bearer` и хранится в `localStorage`
  (осознанный компромисс по XSS; cookie невозможны из-за third-party ограничений).
- **In-memory комнаты**: живые сеансы — `Map<sessionId, Room>` в
  `ActiveGameService`. Несколько независимых комнат; перезапуск теряет идущие
  сеансы (в истории они помечаются `aborted`, модуль `history`); уход ведущего
  запускает grace-таймер `HOST_GRACE_SECONDS`; переподключение игрока
  сохраняет ответы. Для нескольких инстансов потребуется внешнее хранилище
  (Redis) — пока один.
- **ws через `WsAdapter`** с `messageParser`: протокол `{type, payload}` сохранён
  вместо `{event, data}` адаптера.
- **Анти-чит**: `SESSION_STATE` не содержит текста и оценок ответов игроков —
  только факт ответа (`{questionId}`). Тексты раскрываются ведущим через
  `SHOW_ANSWERS`, очки — через `SHOW_WINNERS`.
- **Владение ресурсами**: `gameId`/`questionId` никогда не берутся из тела как
  доказательство — проверка `game.adminId === session.userId` на каждый запрос.
- **Сборка**: `nest build` (tsc с `emitDecoratorMetadata`). tsx/esbuild для
  runtime не используется — они не эмитят DI-метаданные.
