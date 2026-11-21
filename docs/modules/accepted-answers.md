# Модуль accepted-answers

## Назначение

Тексты ответов, принимаемых как верные для вопроса.

## Данные и правила

`AcceptedAnswer`: `id`, `questionId`, `text` (CHECK непустой). `questionId` —
только query-параметр; элементы body — `{text}`, подмена `questionId`
внутри элементов невозможна.

## Интерфейсы

- `GET /api/accepted-answers?questionId=`
- `POST ...` — добавить набор ответов.
- `PUT ...` — **транзакционная** замена (`deleteMany`+`createMany` в `$transaction`):
  при ошибке старые ответы сохраняются.
- `DELETE ...` — удалить все ответы вопроса.

## Зависимости

`PrismaService`, `AuthGuard`, `GamesService`, `ActiveGameService`. Владение —
через `question.game.adminId`; изменения отклоняются 409, пока по квизу идёт
сеанс (`assertQuizEditable`, BR-54).

Варианты `choice`-вопросов — отдельный модуль [options.md](options.md).

## Транзакции

Замена ответов атомарна — главная гарантия модуля.

## Тесты

E2e: добавление/замена/удаление ответов в редакторе.
