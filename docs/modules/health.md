# Модуль health

## Назначение

Probes для оркестратора и балансировщика.

## Интерфейсы

- `GET /api/health/live` → `{status:"ok"}` — процесс жив (liveness).
- `GET /api/health/ready` → `{status:"ok"}` или 503 — выполняет `SELECT 1`
  в БД (readiness). Публичные, без авторизации.

## Зависимости

`PrismaService`.

## Тесты

Smoke в CI и e2e-webServer poll; проверено в контейнере.
