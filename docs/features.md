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

