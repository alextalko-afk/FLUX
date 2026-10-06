# Contributing

1. `pnpm install`, copy `.env.example` to `.env` and `apps/server/.env`, `docker compose up -d`, `pnpm --filter @FLUX/server exec prisma migrate deploy`.
2. `pnpm dev:server` and `pnpm dev:web`.
3. Before a PR: `tsc --noEmit` and `eslint` for the packages you touched, `cd tests && pnpm exec vitest run`, and the integration suite (`vitest run -c vitest.integration.config.ts`, needs the stack running).
4. A new feature comes with a Prisma migration (if the schema changes), a service + controller, one integration test and the web UI.
