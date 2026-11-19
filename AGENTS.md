# Backend

This directory is a separate git repository. Run backend git commands here; the frontend is a sibling repository.

Stack: NestJS 12 (Express adapter), Prisma + PostgreSQL, ws via `@nestjs/platform-ws`, Biome, TypeScript (commonjs, decorators).

## Commands

- `yarn dev` — `nest start --watch` (dotenvx + `.env.development`). Never run `src/` via tsx/node directly — no decorator metadata breaks DI
- `yarn build` — `nest build` to `dist/`; `yarn start` runs `node dist/main.js`
- `yarn lint` / `yarn lint:ci` — Biome check / ci; `yarn format`
- `yarn typecheck` — `tsc --noEmit`
- `yarn test` — node:test via tsx (`test/*.test.ts`); unit-level only, no live DB required
- `yarn db:up` — docker compose: dev PostgreSQL :5432, test PostgreSQL :5433 (tmpfs)
- `yarn prisma-migrate-dev` / `prisma-migrate-prod` (deploy), `prisma-seed-dev`, `prisma-generate`

Package manager is Yarn 1 with `yarn.lock` (use `npx yarn@1.22.22` — yarn is not installed globally). Dependencies are pinned exactly; prefer versions published at least 7 days ago.

## Architecture

`src/` is a NestJS modular monolith — layout and rules in `docs/refactoring-plan.md`. Track progress in `docs/refactoring-checklist.md`.

Key decisions:
- Auth: opaque session token in client localStorage, `Authorization: Bearer` for HTTP; only token hash stored in DB (`Session` table). No JWT, no auth cookies, no guest access.
- WS auth: `POST /api/auth/ws-ticket` (Bearer) → one-time short-lived ticket → connect `ws://…/ws?ticket=…`.
- Protocol `{type, payload}` preserved via custom ws `messageParser` (see `bootstrap.ts`). Server replies `{type, payload}`; structured errors are `FAULT {code, message}`.
- Game rooms: multiple concurrent rooms in memory of a single instance (`ActiveGameService`); restart loses rooms; host disconnect ends the room; player reconnect keeps answers; first answer counts.
- Error shape: `{code, message, requestId}` via `HttpExceptionFilter`.

Biome `organizeImports` is disabled — it converts injected services to `import type`, which breaks Nest DI (emitDecoratorMetadata).

## Data safety

Never reset or delete an existing database without explicit approval. Integration tests must use the dedicated test PostgreSQL (`postgres-test`, :5433), never SQLite. `prisma/migrations-sqlite-legacy/` is kept for history only and is not applied.
