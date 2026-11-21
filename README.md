# piggies quiz backend

Модульный монолит на NestJS: REST API (`/api`), игровой WebSocket (`/ws`),
PostgreSQL + Prisma. Подробности — [docs/](docs/README.md).

## Быстрый старт

```bash
yarn install --frozen-lockfile
yarn db:up                # PostgreSQL через docker compose (:5432)
npx dotenvx run -f .env.development -- node scripts/prisma-env.mjs migrate deploy
yarn dev                  # http://localhost:3000/api
```

- OpenAPI: `/api/docs` (dev), `/api/openapi.json`.
- Проверки: `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build`.
- Деплой — [docs/deployment.md](docs/deployment.md); CI — `.github/workflows/ci.yml`.
