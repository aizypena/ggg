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

## Phase 1 — Soroban Escrow Contract

Implemented the trustless tournament prize-escrow contract (`contracts/escrow`) and published it to Stellar Testnet:

- Crate scaffold, storage model (`DataKey`), and contract error enum (`Error`).
- `initialize` (organizer-only) with validation of distribution bps, entry fee, and organizer≠referee.
- `join_tournament` (player-auth) pulls entry fee, dedupes players, emits `registered` event.
- `finalize_results` (referee-only) pays 60/30/10 with deterministic dust to 1st place; emits `finalized` event.
- `cancel_tournament` (organizer-only) refunds all players; emits `cancelled` event.
- Read-only `get_pool`, `get_reward`, `is_finished`.
- Exhaustive `#[cfg(test)]` suite (28 tests) covering happy paths and all reverts.
- Built, optimized, and uploaded WASM to Testnet; recorded `ESCROW_WASM_HASH` in `apps/web/.env.example`.
- Generated TypeScript bindings under `apps/web/src/contract-client` for Phase 2/4 consumption.

## Phase 2 — Stellar Integration Layer

Built the server-side Stellar integration module (`apps/web/src/lib/stellar/`) that validates inputs, resolves assets, builds unsigned Soroban XDR, submits signed XDR, and polls for results — without ever holding a private key:

- Typed `StellarError` and Zod validators for Stellar public keys (`G…`), contract IDs (`C…`), positive `i128` amounts, base64 XDR, and 10 000-bps distributions.
- Memoized RPC (`rpc.Server`) + Horizon (`Horizon.Server`) client factory from Zod-validated env.
- `resolveSacAddress("XLM" | "USDC")` returning the native SAC from env and deriving the USDC SAC from a network-keyed issuer.
- Network-aware Stellar.Expert URL builders for transactions and contracts.
- Shared Vitest fakes for RPC/Horizon plus canned simulation/transaction responses.
- `simulateAndAssemble` pipeline that always simulates before returning XDR, and `submitSignedXdr` that submits a Freighter-signed XDR and polls `getTransaction` with bounded retries/timeouts.
- Unsigned-XDR builders for `join_tournament`, `finalize_results`, `cancel_tournament`, and `deploy` (the generated Phase 1 binding deploys the contract; initialize is a known follow-up once the contract/binding supports constructor-style deploy or a manual multi-op transaction).
- Public barrel (`index.ts`) exporting the exact Phase-4 contract surface.
- Gated Testnet integration test (`RUN_STELLAR_IT=1`) proving a deploy XDR simulates successfully against Testnet.
- Added `@stellar/stellar-sdk` 15 to `apps/web` and adjusted the generated contract-client package for strict TypeScript/ESLint compatibility.


## Phase 5 — Event Subscriber & Live Feed

Stood up the standalone `apps/subscriber` worker that ingests on-chain activity into Postgres and publishes it to Redis, and wired the Phase 4 detail page to a live SSE feed so joins/finalisations/cancellations propagate without a refresh:

- `SubscriberCursor` model + migration (per-contract ledger cursor) and a `ContractEvent @@unique([txHash, type])` migration backing idempotent dedupe.
- `apps/subscriber` package: Zod-validated `getEvents`/Horizon `payments` wrapper, fail-closed env loader, Prisma singleton reusing the web-generated client through the `web` workspace dependency.
- Per-contract ledger cursor with restart recovery (`getCursor`/`setCursor`), advanced only after a successful ingest+publish pass (at-least-once).
- Idempotent reconciliation of `registered`/`finalized`/`cancelled` events into `ContractEvent`/`Participant`/`Payout`/`Tournament` inside one transaction, deduped on `txHash` (replays are no-ops); money handled as `BigInt`.
- SEP-7 deposit reconciliation: untrusted Horizon payments become registrations only when `memo == tournamentId` and the destination is the contract address.
- Redis publish to `tournament:<id>` + `pollTournament` orchestration; service loop polls every `ACTIVE` tournament with a `contractId`, isolates per-tournament failures, and shuts down gracefully on SIGTERM/SIGINT.
- `GET /api/tournaments/[id]/events` SSE route: replays recent confirmed `ContractEvent` rows from Postgres (source of truth) then streams the Redis channel, with heartbeats and a `?fallback=poll` mode.
- `useTournamentEvents` EventSource hook with auto-reconnect; `<PrizePoolCounter>` ticks up off the stream (key-driven `pool-pop` keyframe, reduced-motion aware) and `<LiveFeed>` renders a human-readable gloss ticker (reduced-motion aware).

End-to-end live-propagation verification (P5.12) is documented as manual steps in the plan/PR — it requires the docker-compose Postgres+Redis stack plus Testnet RPC/Horizon and on-chain transactions, which the CI/sandbox environment does not provide.

## Phase 6 — Hardening & Ship

Wrapping the Phase 0–5 app in test, CI, security, and deployment layers (no new product features).

- **Security headers (P6.4):** hardened the shared `buildSecurityHeaders()` source of truth (consumed by both `next.config.ts` `headers()` and the auth middleware) — CSP now allows the Stellar.Expert explorer origin (a distinct domain from the `*.stellar.org` RPC/Horizon wildcard) and the S3/MinIO image origin (`S3_PUBLIC_ORIGIN`), and adds `object-src 'none'` and `upgrade-insecure-requests`. Strengthened the unit test to assert the exact HSTS/Referrer/X-Frame/X-Content-Type/Permissions-Policy values and every locked-down CSP directive.
- **pnpm audit clean (P6.5):** all 11 `high` advisories were transitive `axios` (`<1.16.0`, pulled via `@stellar/stellar-sdk`). Added a root `pnpm.overrides` entry (`axios@<1.16.0` → `^1.16.0`, resolves to 1.18.1), bringing `pnpm audit --audit-level high` to a clean exit (0 high; 3 moderate remain, below the gate).
- **Railway deploy config (P6.7):** added Railway service configs for the three monorepo services. `apps/web/railway.json` (NIXPACKS) builds with `db:generate && next build`, starts `next start`, and runs `prisma migrate deploy && prisma db seed` as the `preDeployCommand` release hook with a `/api/auth/me` healthcheck. `apps/subscriber/railway.json` builds only `db:generate` (the worker runs via `tsx`, no compile step) and runs `pnpm --filter subscriber start` with `restartPolicyType: ALWAYS`. `infra/file-storage/{Dockerfile,railway.json}` ship a MinIO image (DOCKERFILE builder) for the S3-compatible store backed by a Railway Volume at `/data`. Provisioning + per-env variables are documented in RUNBOOK (#90); the configs are committed but the actual Railway provisioning/`railway up` requires a Railway account and is not run from the sandbox.
