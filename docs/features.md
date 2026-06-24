# Features Log

Running log of shipped features (append one entry per change), per the auto-dev workflow.

## Phase 0 — Foundation

Stood up the GGG pnpm 10 monorepo skeleton with zero business logic, so every later phase has a proven foundation:

- pnpm 10 workspace (`apps/web`, `apps/subscriber`, `contracts/escrow`); Node 22+ pinned via `engines`/`.nvmrc`; corepack.
- Shared strict TypeScript base config (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`) + Prettier.
- Next.js 16 web app (App Router, Turbopack, React 19.2, strict TS, ESLint+Prettier, Tailwind v4 wired).
- Subscriber + escrow contract workspace placeholders (no logic).
- `docker-compose.yml` dev stack: Postgres 17, Redis 7, MinIO + bucket bootstrap.
- Zod-validated, fail-closed env loader (`apps/web/src/lib/env.ts`) mirroring SPEC §14 plus `USDC_ISSUER` / `USDC_SAC_ADDRESS`; committed `.env.example`.
- `{ ok, data?, error? }` API envelope helpers (`ok`/`err`) + shared validation dir.
- Full Prisma 7 schema (SPEC §10), initial migration, singleton `prisma` client, idempotent admin seed.
- Tailwind v4 `@theme` with the complete BRAND §2 token table, signature classes, keyframes, Sora + Space Mono + Material Symbols; dark-only.
- shadcn/ui initialized and themed to GGG tokens (Button primitive).
- Base CI (install + prisma generate + typecheck + lint + format check); README quickstart.
