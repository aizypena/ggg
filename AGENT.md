# AGENT.md — GGG Engineering Guide

Operating manual for the AI coding agent building **GGG** (Good Game Guild): a trustless tournament prize-escrow and match-verification protocol on Stellar Soroban. Read `SPEC.md` (what to build) and `BRAND.md` (how it looks) alongside this file (how to build it well and safely).

This is a system that moves real money on-chain. Default to caution: validate everything, trust nothing from the client, and never let a private key near the server.

---

## 1. Golden rules

1. **Pin the latest stable versions.** At setup, resolve exact versions with `pnpm add <pkg>@latest` and commit `pnpm-lock.yaml`. Don't copy version numbers from memory or from the spec prose — they drift. Verify against the registry. Targets (current as of build): Next.js 16, React 19.2, TypeScript 5.x, Tailwind 4, Prisma 7, `@stellar/stellar-sdk` 15, `soroban-sdk` 26 (Rust), `@stellar/freighter-api` 5, Node 22 LTS, pnpm 10.
2. **The server never holds private keys.** It builds, simulates, submits, and reads. All signing is client-side via Freighter. There is no code path that imports, stores, logs, or transmits a secret key.
3. **Validate every input with Zod** — request bodies, query params, route params, env vars, and any external data (RPC responses) before use.
4. **Money is `BigInt`, never `float`.** Token amounts are in the smallest unit (XLM = stroops, 10⁷ per XLM). No floating-point arithmetic on balances or splits.
5. **Authorization on the contract is the source of truth.** `require_auth()` on organizer/referee/player as specified; the web layer's role checks are defense-in-depth, not the primary guard for fund movement.
6. **Fail closed.** On any ambiguity in auth, validation, or on-chain state, reject and surface a clear, non-leaky error.
7. **No secrets in the repo.** Everything sensitive comes from env; `.env` is gitignored; only `.env.example` is committed with empty/placeholder values.

---

## 2. Repository layout

A pnpm workspace monorepo keeps the contract and the app together.

```
ggg/
├─ apps/
│  └─ web/                      # Next.js 16 app (frontend + API)
│     ├─ src/
│     │  ├─ app/                # App Router (routes, route handlers)
│     │  ├─ components/         # UI (shadcn/ui + brand system)
│     │  ├─ lib/                # stellar/, auth/, db/, redis/, validation/
│     │  ├─ contract-client/    # generated TS bindings (do not hand-edit)
│     │  └─ server/             # tx builders, services, event subscriber
│     ├─ prisma/                # schema.prisma, migrations, seed.ts
│     ├─ prisma.config.ts
│     ├─ proxy.ts               # Next 16 middleware (route guards)
│     └─ .env.example
├─ contracts/
│  └─ escrow/                   # Rust Soroban contract
│     ├─ src/lib.rs
│     ├─ src/test.rs
│     └─ Cargo.toml
├─ docker-compose.yml           # postgres, redis, minio (dev)
├─ pnpm-workspace.yaml
└─ README.md
```

---

## 3. Toolchain & setup

- **Node 22 LTS**, **pnpm 10** (`corepack enable`). Enforce with `engines` in `package.json` and an `.nvmrc`.
- **Rust** stable + `wasm32v1-none` target + `stellar-cli` (`soroban`) 26 for the contract.
- **TypeScript strict mode** on: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- **Lint/format:** ESLint (next config) + Prettier (or Biome). CI fails on lint/type errors.
- **Tailwind v4:** CSS-first `@theme` (see `BRAND.md` §9); wire `@tailwindcss/postcss` in Next's PostCSS config. No `tailwind.config.js` unless a plugin needs it.
- **shadcn/ui:** install via its CLI; theme components to the GGG tokens, don't accept defaults.

---

## 4. Frontend best practices

- **Server Components by default.** Use Client Components only where interactivity/wallet access is needed (`"use client"` at the leaf, not the page root). Wallet code (Freighter) is always client-side.
- **Server Actions / Route Handlers** for mutations; keep secrets and tx-building server-side.
- **Data fetching:** prefer server-side fetches and streaming; the live feed uses **SSE** (`/api/tournaments/[id]/events`) with a polling fallback.
- **Forms:** validate with the same Zod schema on client and server (share the schema). Show inline, specific errors; never trust client validation alone.
- **Accessibility floor:** semantic HTML, visible keyboard focus (the brand's violet ring), `prefers-reduced-motion` respected for all the animations in `BRAND.md` §6, AA contrast, responsive to mobile (top-nav → bottom tab bar).
- **No `localStorage` for anything security-relevant.** Session lives in an httpOnly cookie; wallet address is fetched live from Freighter, not persisted as an auth claim.
- **Optimistic UI** for join/registration is acceptable, but reconcile against confirmed on-chain events before treating a registration/payout as final.

### Freighter integration pattern
```ts
// client only
import freighter from "@stellar/freighter-api";

async function ensureWallet(expectedPassphrase: string) {
  if (!(await freighter.isConnected())) throw new Error("Freighter not installed");
  await freighter.requestAccess();
  const { address } = await freighter.getAddress();
  const { networkPassphrase } = await freighter.getNetwork();
  if (networkPassphrase !== expectedPassphrase) throw new Error("Wrong network");
  return address;
}
// build XDR on server → sign here → POST signed XDR back for submission
const { signedTxXdr } = await freighter.signTransaction(unsignedXdr, { networkPassphrase });
```

---

## 5. Backend best practices

- **Thin handlers, fat services.** Route Handlers parse + authorize + delegate; business logic lives in `server/services`.
- **Consistent envelope:** `{ ok, data?, error? }`. Map errors to correct HTTP codes; never leak stack traces, SQL, or internal identifiers to clients.
- **Transaction-building service** (`lib/stellar`): one place builds, simulates (`simulateTransaction`), assembles, and submits Soroban transactions, and polls `getTransaction` until success/failure with sane timeouts and retries. Always **simulate before returning an XDR** so the client never signs a tx that will fail.
- **Idempotency:** `/submit` accepts an idempotency key; dedupe submissions and event ingestion on `txHash`.
- **Event subscriber:** at-least-once processing with a per-contract ledger cursor and idempotent upserts. Reconcile both contract events (`getEvents`) and SEP-7 deposit fallbacks (Horizon payments with `memo == tournamentId`).
- **Prisma 7:** `generator client { provider = "prisma-client" }`, configure via `prisma.config.ts`, use a singleton client (avoid exhausting connections in dev/hot-reload), and use transactions for multi-write operations. Run `prisma migrate deploy` + `prisma db seed` on release.
- **Redis:** rate limiting (per-IP + per-user), optional session cache (enables revocation), and SSE pub/sub. Treat Redis as ephemeral — never the source of truth.

---

## 6. Smart contract best practices (Soroban / Rust)

- **`soroban-sdk` 26**, `#![no_std]`, compile to `wasm32v1-none`. Keep the contract minimal and auditable.
- **Authorization:** `organizer.require_auth()` for `initialize`/`cancel`; `referee.require_auth()` for `finalize_results`; `player.require_auth()` for `join`. Never authorize fund movement off a server-held key.
- **Asset-agnostic escrow:** take the token SAC `Address` at `initialize`; move funds with the token client's `transfer`. Pull entry fees with `transfer(player → contract)`; pay out / refund with `transfer(contract → recipient)`.
- **Validation in-contract:** `distribution_bps` length 3 and sums to exactly 10000; `entry_fee > 0`; `organizer != referee`; winners distinct **and** registered; tournament not already finished/cancelled. Panic (revert) on violation.
- **No withdraw function.** Funds exit only through payout or refund logic. Make `finalize`/`cancel` single-shot (guard with state flags).
- **Deterministic rounding:** when `pool * bps / 10000` leaves a remainder, assign the dust deterministically (e.g. to 1st place) so the sum of payouts equals the pool exactly.
- **Events** for every state change (`registered`, `finalized`, `cancelled`) — the off-chain subscriber depends on them.
- **Overflow safety:** use `i128` and checked arithmetic; never let a multiplication overflow.
- **Testing:** comprehensive `#[cfg(test)]` suite with `Env::default()` covering happy paths and every revert (unauthorized caller, double-finalize, unregistered winner, duplicate winner, bad bps, join after finish, cancel after finalize). Treat the test suite as part of "done".
- **Deploy discipline:** upload WASM once, record the hash, instantiate per tournament; pin the contract to a specific Protocol/network. Regenerate TS bindings whenever the interface changes.

---

## 7. Security checklist (application)

**Authentication & sessions**
- Hash passwords with **argon2id** (sensible memory/time params); per-user salts handled by the library. Never log or return password material.
- Sessions: signed (`jose`) httpOnly + Secure + SameSite=Lax cookie; short-lived with rotation; server-side revocation via Redis. No JWTs in `localStorage`.
- Generic auth errors (no username enumeration). Throttle and rate-limit `login`/`register`.
- Enforce a password policy; consider lockout/backoff on repeated failures.

**Authorization**
- Role checks (`ADMIN`, `ORGANIZER`) on every protected handler; referee actions gated on wallet == `Tournament.refereeAddr`. Never authorize by client-supplied role.
- IDOR protection: scope every tournament query to the authenticated owner where applicable; verify resource ownership before mutating.

**Input & output**
- Zod-validate all inputs; validate Stellar addresses (`G…`/`C…`) and amounts strictly. Reject malformed XDR before submitting.
- Output-encode/escape all user-controlled content; React handles most XSS but be careful with any `dangerouslySetInnerHTML` (avoid it) and with QR/URI construction.
- Set a strict **Content-Security-Policy**, plus `X-Content-Type-Options`, `Referrer-Policy`, HSTS, and frame protections. (Note current Next.js middleware/proxy CVE history — keep Next patched and don't rely on middleware alone for authz.)

**CSRF & transport**
- CSRF protection on cookie-authenticated mutations (SameSite=Lax + origin/host check, or double-submit token).
- HTTPS everywhere; secure cookies; trust the proxy headers only from Railway's edge.

**On-chain specific**
- Always **simulate** before asking the user to sign; show the user what they're authorizing (amount, destination, network).
- Verify the wallet's network matches the server's target network before building/submitting.
- Reconcile UI state against **confirmed** ledger events; don't mark funds moved on optimistic state.
- Treat memos/SEP-7 deposits as untrusted until reconciled to a registered player.

**Dependencies & secrets**
- Keep dependencies current; run `pnpm audit` in CI and patch promptly (Next.js, React, and the Stellar SDKs all ship security releases — track them).
- Secrets only via env / Railway variables. Rotate the seeded admin password off the default immediately in any shared environment.
- Validate env at boot with Zod; refuse to start if required vars are missing.

**Data**
- Principle of least privilege on the DB user. Parameterized queries only (Prisma handles this — never build raw SQL from input without `Prisma.sql`).
- Don't store PII you don't need. Wallet addresses are public; passwords are hashed; nothing else sensitive should persist.

---

## 8. Validation, testing & CI

- **Unit:** services, validators, tx-builders (mock RPC), and the Rust contract suite.
- **Integration:** API routes against a test Postgres (Testcontainers or the docker-compose stack); contract calls against Testnet or local quickstart.
- **E2E:** the demo path (create → join → finalize → payouts; and cancel → refund) — ideally Playwright with a Testnet wallet fixture.
- **CI gates:** typecheck, lint, unit + integration tests, `pnpm audit`, contract build + tests. Block merge on failure.
- **Migrations:** every schema change ships a Prisma migration; never edit an applied migration — add a new one.

---

## 9. Environment & deployment (Railway)

- Provision **PostgreSQL 17** and **Redis** plugins; inject `DATABASE_URL` / `REDIS_URL`.
- Deploy the Next.js app (`pnpm build` → `pnpm start`); release command runs `prisma migrate deploy && prisma db seed`.
- Deploy **file storage** (MinIO service or a small storage service on a Railway **Volume**); inject S3-compatible env (`S3_ENDPOINT`, bucket, keys).
- Deploy the **event subscriber** as a separate Railway service if it runs out-of-process.
- Set `STELLAR_NETWORK`, `SOROBAN_RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`, `ESCROW_WASM_HASH`, `NATIVE_SAC_ADDRESS` per environment (Testnet for staging/demo, Public for prod).
- All secrets via Railway variables; nothing committed. See `.env.example` for the full key list (mirrors `SPEC.md` §14).

### Local dev
```bash
corepack enable && pnpm install
docker compose up -d            # postgres, redis, minio
cp apps/web/.env.example apps/web/.env   # fill in values
pnpm --filter web prisma migrate dev
pnpm --filter web prisma db seed
pnpm --filter web dev
# contract
cd contracts/escrow && stellar contract build && cargo test
```

---

## 10. Definition of done

A feature is done when: it has tests (incl. failure cases), inputs are Zod-validated, errors are handled and non-leaky, it matches `BRAND.md`, it's accessible and responsive, no secret touches the client or the repo, dependencies are current and `pnpm audit` is clean, and — for anything moving funds — the contract enforces the rule independently of the web layer, with passing contract tests.
