# GGG — Good Game Guild

Trustless tournament prize-escrow protocol on Stellar Soroban.

- `apps/web` — Next.js 16 app (frontend + API)
- `apps/subscriber` — background event subscriber (Phase 5)
- `contracts/escrow` — Soroban escrow contract (Phase 1)

See `SPEC.md` (what), `BRAND.md` (look), `AGENT.md` (how/safety).

## Local development

Requires Node 22+, pnpm 10, Docker.

```bash
corepack enable
pnpm install
docker compose up -d                       # postgres 17, redis 7, minio
cp apps/web/.env.example apps/web/.env      # then fill SESSION_SECRET, CSRF_SECRET, ADMIN_PASSWORD
pnpm --filter web db:migrate                # apply Prisma migrations
pnpm --filter web db:seed                   # idempotent admin upsert
pnpm --filter web dev                       # http://localhost:3000
```

## Quality gates

```bash
pnpm -r typecheck
pnpm -r lint
pnpm format:check
pnpm --filter web test
```
