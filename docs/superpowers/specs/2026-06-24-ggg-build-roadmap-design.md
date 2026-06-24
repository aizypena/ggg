# GGG — Build Roadmap & Decomposition (Design)

**Date:** 2026-06-24
**Status:** Approved decomposition; Phase 0 plan to follow.
**Scope of this document:** *How* and *in what order* we build GGG. It does **not** restate the product. `SPEC.md` is the authoritative *what-to-build*; `BRAND.md` is the design system; `AGENT.md` is the engineering/security rulebook. This roadmap decomposes that spec into a sequence of independently-shippable sub-projects, records the decisions the spec left open, and fixes the dependency order.

---

## 1. Build goal & resolved decisions

- **Goal:** Production-grade full build to `AGENT.md` §10 "Definition of done" — the entire `SPEC.md`, not a demo cut. XLM **and** USDC. Mainnet-ready, Testnet for dev/demo.
- **Web-app auth:** **NextAuth/Auth.js v5** (credentials provider) — not the hand-rolled jose flow. Must still satisfy `SPEC.md` §7 / `AGENT.md` §7: argon2id hashing, httpOnly + Secure + SameSite=Lax session cookie, Redis-backed revocation, generic auth errors, rate limiting. NextAuth provides the session machinery; we configure it to the spec's cookie/revocation model rather than accepting defaults.
- **Event subscriber:** **Separate Railway service** (`apps/subscriber`) — independent lifecycle and scaling, shares code with the web app through the monorepo, communicates results via Postgres + Redis pub/sub.
- **SEP-7 / QR:** deep-link into the GGG join page (builds a proper `join_tournament` invocation) is the **primary** path; raw SEP-7 deposits to the contract address are a **reconciled fallback** (subscriber matches `memo == tournamentId`). Per `SPEC.md` §8.
- **Monetary values:** `BigInt` / `i128` end to end; smallest unit (XLM = stroops). No floats, per `AGENT.md` §1.4.

These decisions are settled for the whole build; phase specs inherit them and do not re-litigate.

---

## 2. Decomposition principle

**Trust core → money rails → surface → live state → hardening.** A phase that moves funds does not begin until the layer beneath it is proven. The contract is tested before any app code can call it; the tx-building layer is built before any page can trigger a transaction; auth gates exist before protected pages.

Each phase is its own `spec → plan → implement → test` cycle with its own brainstorm where the phase has open design questions. Phases are ordered by dependency, not by visible progress.

---

## 3. Phase sequence

### Phase 0 — Monorepo & foundation
The skeleton every later phase imports. No business logic.
- pnpm 10 workspace: `apps/web`, `apps/subscriber`, `contracts/escrow`; `pnpm-workspace.yaml`.
- Node 22 LTS pinned via `engines` + `.nvmrc`; `corepack enable`.
- TypeScript strict: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- Lint/format (ESLint next config + Prettier); base CI skeleton (typecheck + lint).
- `docker-compose.yml`: `postgres:17`, `redis:7`, `minio` + `createbuckets`.
- Zod-validated env loader (refuse to boot on missing vars) + committed `.env.example` mirroring `SPEC.md` §14.
- Prisma 7: `generator client { provider = "prisma-client" }`, `prisma.config.ts`, the full schema from `SPEC.md` §10, initial migration, singleton client, `seed.ts` (idempotent admin upsert from env).
- Tailwind v4 CSS-first `@theme` with the complete `BRAND.md` §2 token table; signature classes (`.brutalist-border`, `.kinetic-glass`, `.high-contrast-card`, `.acid-glow`, `.violet-accent`) and keyframes; Sora + Space Mono + Material Symbols loaded; `<html class="dark">`.
- shadcn/ui initialized and themed to GGG tokens (not defaults).

**Done when:** `docker compose up` + `pnpm install` + migrate + seed + `pnpm --filter web dev` boots a themed blank app; env validation fails loudly on a missing key; CI typecheck/lint green.

### Phase 1 — Soroban escrow contract
The trust core. Independent of the app.
- Rust `#![no_std]`, `soroban-sdk` 26, `wasm32v1-none`.
- All functions: `initialize`, `join_tournament`, `finalize_results`, `get_pool`, `get_reward`, `is_finished`, `cancel_tournament`.
- Storage/state, events (`registered`/`finalized`/`cancelled`), every security invariant from `SPEC.md` §4 / `AGENT.md` §6.
- Deterministic dust → 1st place; checked `i128` arithmetic; asset-agnostic via token SAC `Address`.
- Exhaustive `#[cfg(test)]` suite (`Env::default()`): happy paths + every revert (unauthorized caller, double-finalize, unregistered/duplicate winner, bad bps, join after finish, cancel after finalize).
- `stellar contract build` → upload once → record WASM hash → generate TS bindings into `apps/web/src/contract-client`.

**Done when:** `cargo test` fully green covering all invariants; WASM builds; bindings generated; hash recorded for env.

### Phase 2 — Stellar integration layer
The single place that builds, simulates, submits, and reads transactions. Server-side, never holds keys.
- `lib/stellar`: Soroban RPC + Horizon clients; the `simulate → assemble → submit → poll getTransaction` pipeline with timeouts/retries; **always simulate before returning an XDR**.
- Network-aware Stellar.Expert URL builder; SAC address resolution for XLM (native) + USDC (issuer SAC).
- Strict Zod validation of `G…`/`C…` addresses, amounts, and inbound XDR.
- tx-builders: deploy + `initialize`, `join_tournament`, `finalize_results`, `cancel_tournament` — each returns unsigned XDR.

**Done when:** unit tests (mock RPC) for each builder + the submit/poll pipeline; a builder produces an XDR that simulates successfully against Testnet for a contract from Phase 1.

### Phase 3 — Auth & identity
- NextAuth v5 credentials provider; argon2id; `SPEC.md` §7 cookie model; Redis session cache + revocation.
- Routes: `POST /api/auth/register`, `login`, `logout`, `GET /api/auth/me`; roles `ADMIN`/`ORGANIZER`; generic errors (no enumeration).
- `proxy.ts` middleware guarding `(dashboard)` + `/admin`; CSRF on cookie mutations; Redis rate limiting (per-IP + per-user); security headers/CSP per `AGENT.md` §7.

**Done when:** register/login/logout/me work; protected routes redirect unauthenticated users; revocation invalidates a live session; rate limit + CSRF enforced; integration tests against test Postgres + Redis.

### Phase 4 — Tournament domain (API + pages)
The bulk, built as vertical slices on Phases 1–3.
- **4a** Create → build deploy+`initialize` XDR (`POST /api/tournaments`); `POST /api/tournaments/[id]/submit` (intent `deploy`/`finalize`/`cancel`, idempotency keys); `GET /api/tournaments` (filter+paginate, owner-scoped); `GET /api/tournaments/[id]`.
- **4b** `POST .../join`, `POST .../finalize` (validate distinct + registered), `POST .../cancel`.
- **4c** Pages per `SPEC.md` §5 + `BRAND.md`: `/`, `/login`, `/register`, `/tournaments`, `/tournaments/new`, `/tournaments/[id]`, `/tournaments/[id]/settle` (drag-and-drop console), `/admin`. Server Components by default; `"use client"` at leaves.
- **4d** Freighter client integration (`ensureWallet` pattern, network check, sign → POST signed XDR).
- **4e** `POST /api/uploads` presigned S3/MinIO for cover images; MIME/size validation; never trust client filenames.

**Done when:** an organiser can create a tournament end-to-end (deploy confirmed, status ACTIVE, QR generated), a player can join, a referee can finalize, an organiser can cancel — each via Freighter signing, each reconciled to on-chain result; pages match `BRAND.md`, are responsive and accessible (AA, focus rings, `prefers-reduced-motion`).

### Phase 5 — Event subscriber + live feed
- `apps/subscriber`: per-`ACTIVE`-tournament `getEvents` polling from a per-contract ledger cursor; idempotent upserts (dedupe on `txHash`); maps events to `ContractEvent`/`Participant`/`Payout`/`Tournament` state.
- Horizon SEP-7 deposit reconciliation (`memo == tournamentId`) for the QR fallback.
- Redis pub/sub → SSE `GET /api/tournaments/[id]/events` (polling fallback).
- Live UI: pool counter tick-up, participant list, registration/finalisation tx ticker, winners + explorer links on finish.

**Done when:** joining/finalising/cancelling on-chain propagates to the detail page live without refresh; subscriber recovers cursor across restart; raw SEP-7 deposit reconciles to a registration.

### Phase 6 — Hardening & ship
- E2E (Playwright): the §15 demo path (create → join → finalize → 3 payouts) and cancel → refund, against Testnet with a wallet fixture.
- CI gates: typecheck, lint, unit + integration, `pnpm audit`, contract build + tests — block merge on failure.
- Railway: provision Postgres 17 + Redis; deploy web, subscriber, and file storage services; release runs `prisma migrate deploy && prisma db seed`; all secrets via Railway variables; network env per environment.
- Verify all six `SPEC.md` §15 acceptance criteria, including the sub-two-minute happy path.

**Done when:** every §15 criterion passes on a deployed Testnet environment; CI is green and gating; `pnpm audit` clean.

---

## 4. Dependency graph

```
Phase 0 (foundation)
   ├─► Phase 1 (contract) ──► Phase 2 (stellar layer) ─┐
   └─► Phase 3 (auth) ─────────────────────────────────┤
                                                        ▼
                                              Phase 4 (domain: API + pages)
                                                        │
                                                        ▼
                                              Phase 5 (subscriber + live feed)
                                                        │
                                                        ▼
                                              Phase 6 (hardening & ship)
```

Phase 1 and Phase 3 can proceed in parallel after Phase 0 (different domains, no shared code). Phase 2 needs Phase 1's bindings. Phase 4 needs Phases 2 and 3. Phases 5 and 6 are sequential tails.

---

## 5. Cross-cutting rules (apply to every phase)

Inherited from `AGENT.md`; non-negotiable, not re-stated per phase:
- Server never holds private keys; all signing client-side via Freighter.
- Zod-validate every input (bodies, params, query, env, RPC responses).
- Money is `BigInt`/`i128`, never float.
- Contract `require_auth()` is the source of truth; web role checks are defense-in-depth.
- Fail closed; no secrets in the repo; consistent `{ ok, data?, error? }` envelope; non-leaky errors.
- Every schema change ships a new migration; never edit an applied one.
- A feature is "done" only with tests (incl. failure cases), brand-compliance, accessibility, and — for fund movement — independent contract enforcement with passing contract tests.

---

## 6. Cross-phase reconciliation (authoritative)

All seven phase plans now exist under `docs/superpowers/plans/2026-06-24-ggg-phaseN-*.md`. They were authored in parallel; the following deltas were surfaced during authoring and are **binding** — where a phase plan and this list disagree, this list wins. Apply each delta in the phase named.

1. **USDC env keys (Phase 0).** SPEC §14's env list predates the XLM+USDC decision and defines only `NATIVE_SAC_ADDRESS`. Phase 0's Zod env loader and `.env.example` MUST also define `USDC_ISSUER` (G-address of the USDC issuer, per network) and `USDC_SAC_ADDRESS` (the issuer's Stellar Asset Contract id). Phase 2 `resolveSacAddress("USDC")` returns `USDC_SAC_ADDRESS`; Phase 4 SEP-7 URI construction reads `USDC_ISSUER` for the `asset_issuer` param. Add both to the Railway env matrix in Phase 6.

2. **API envelope helper signature (Phase 0).** `apps/web/src/lib/api.ts` exports `ok(data, status = 200)` and `err(code, message, status = 400)` returning `{ ok, data?, error?: { code, message } }`. Phases 3 and 4 consume exactly this signature.

3. **Schema additions ship as new migrations in Phase 5 (never edit Phase 0's applied migration).** Phase 5 adds: a `SubscriberCursor` model `{ contractId String @id, lastLedger Int, updatedAt DateTime @updatedAt }` for at-least-once cursor recovery, and `@@unique([txHash, type])` on `ContractEvent` for idempotent event dedupe. Both are additive migrations created during Phase 5.

4. **Contract bindings command (Phase 1 → Phase 2).** Generate TS bindings with stellar-cli 26: `stellar contract bindings typescript --wasm <wasm> --output-dir apps/web/src/contract-client --overwrite` (SPEC §4's `npx @stellar/stellar-sdk generate` phrasing is older). Phase 2's builders import from `apps/web/src/contract-client`; if the generated client's method/export names differ from the assumed `new Client({...})` / static `Client.deploy(...)` shape, adjust Phase 2 Tasks 7–8 call sites — validation/pipeline/return shapes are unaffected.

5. **Login throttling lives inside NextAuth (Phase 3).** Because NextAuth owns the login route, per-IP/per-user rate limiting is enforced by calling `rateLimit()` at the top of the Credentials `authorize()` callback, not in a standalone route handler.

6. **`get_pool` form (Phase 1).** Returns the deterministic `players.len() * entry_fee`; `finalize_results` and `get_reward` compute splits off the same value for internal consistency.

## 7. Status & next step

Brainstorm → spec → all seven plans: **complete.** 92 tasks across the seven plans.

Recommended execution order follows the dependency graph (§4): Phase 0 → (Phase 1 ∥ Phase 3) → Phase 2 → Phase 4 → Phase 5 → Phase 6. Each phase is executed task-by-task via `superpowers:subagent-driven-development` (fresh subagent + review per task) or `superpowers:executing-plans` (batched with checkpoints).
