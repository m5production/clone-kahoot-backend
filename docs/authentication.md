# Аутентификация и авторизация

Серверные сессии без JWT и без auth-cookie. Участники — только зарегистрированные
аккаунты; гостевого входа нет.

## Поток

1. `POST /api/users` (регистрация) или `POST /api/users/auth` (вход) →
   `{id, name, token}`. Токен — случайный, возвращается клиенту один раз.
2. Клиент хранит токен в `localStorage` (`sessionToken`) и шлёт
   `Authorization: Bearer <token>`.
3. На сервере `AuthGuard` ищет `Session` по sha256-хешу токена: сессия валидна,
   если `revokedAt IS NULL` и `expiresAt > now`.
4. `POST /api/users/logout` → `revokedAt = now` (отзыв) + клиент чистит storage.
5. `GET /api/users/me` — текущий пользователь по токену (восстановление входа
   после перезагрузки страницы).

`GET /api/users/:id` возвращает только `{id, name}` и **не** создаёт сессию.

## Почему Bearer + localStorage, а не cookie

Фронт (GitHub Pages) и API (Amvera) — разные сайты: cookie API было бы
сторонним и блокировалось бы браузерами. JWT не решает эту проблему — она про
хранилище, а не формат. Принятый компромисс: токен в `localStorage` читается
JavaScript'ом → при XSS его можно украсть. Поэтому: ограниченный TTL сессии,
отзыв при logout, токен не попадает в URL/логи, защита от XSS обязательна.

## WebSocket

`Authorization`-заголовок в браузерном WS-апгрейде недоступен, а токен в URL
нельзя (утечёт в логи). Поэтому одноразовый билет:

1. Авторизованный `POST /api/auth/ws-ticket` → `{ticket}` (TTL 30 с).
2. Подключение `ws://host/ws?ticket=<ticket>` — билет погашается при коннекте;
   невалидный/истёкший → close 4401.
3. `Origin` апгрейда проверяется по `ALLOWED_ORIGINS` → close 4403.

## Авторизация

- Идентичность всегда из сессии/билета, никогда из payload (`userId`,
  `playerId` в теле игнорируются).
- Владение ресурсами: `game.adminId === session.userId` для всех операций с
  игрой, вопросами и ответами; `users/:id` — только свои.
- WS: `START_GAME`/`CHANGE_QUESTION`/`SHOW_ANSWERS`/`SHOW_WINNERS`/`END_GAME` —
  только ведущий комнаты; `ANSWER_QUESTION` — только игрок, только активный
  вопрос, один раз.
- Rate limit (in-memory, per IP+path): вход и регистрация; при `NODE_ENV=test` —
  отключён.
