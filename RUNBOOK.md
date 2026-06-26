# GGG Deploy & Acceptance Runbook

Operational runbook for deploying GGG (web + subscriber + file-storage) to Railway
and verifying the six SPEC §15 acceptance criteria on a live Testnet environment.

> Money rule: the escrow contract holds and pays funds; no service ever holds a
> private key. The web app builds unsigned XDR; signing happens in the user's
> Freighter wallet (or, in E2E, the documented test shim — see §7).

---

## 1. Prerequisites

- A **Railway** project, the `railway` CLI (`npm i -g @railway/cli`), and `gh` CLI.
- Recorded **`ESCROW_WASM_HASH`** and **`NATIVE_SAC_ADDRESS`** per network (Testnet
  values were recorded in Phase 1; see `apps/web/.env.example`).
- `pnpm` 10, Node 22+ (`.nvmrc`), Docker (for local parity).
- Generated secrets: `SESSION_SECRET` and `CSRF_SECRET` (≥32 chars each), e.g.
  `openssl rand -hex 32`.

## 2. Provision data plugins

```bash
railway add --plugin postgresql   # Postgres 17 → exposes DATABASE_URL
railway add --plugin redis        # Redis      → exposes REDIS_URL
```

Both the **web** and **subscriber** services reference the same `DATABASE_URL`
and `REDIS_URL` (Railway variable references, e.g. `${{Postgres.DATABASE_URL}}`).

## 3. Deploy the three services

Each service deploys from this one monorepo using its committed `railway.json`.

| Service | Config | Build | Start | Release hook |
|---|---|---|---|---|
| web | `apps/web/railway.json` | `pnpm install && db:generate && next build` | `pnpm --filter web start` | `prisma migrate deploy && prisma db seed` (`preDeployCommand`) |
| subscriber | `apps/subscriber/railway.json` | `pnpm install && db:generate` | `pnpm --filter subscriber start` | none (web owns the schema) |
| file-storage | `infra/file-storage/railway.json` | MinIO `Dockerfile` | image `ENTRYPOINT` | none |

- The web **release hook** (`preDeployCommand`) runs `prisma migrate deploy`
  (committed migrations only — never edit an applied migration) and the
  idempotent `prisma db seed` before the new container takes traffic.
- Attach a **Railway Volume** to file-storage mounted at `/data`, and create the
  `ggg-uploads` bucket on first boot.

```bash
railway up   # run per service, or deploy via the dashboard / GitHub integration
```

## 4. Per-environment variable matrix

Set on **web** and **subscriber** (Railway dashboard or `railway variables --set`).

| Variable | Testnet (staging/demo) | Public (prod) |
|---|---|---|
| `STELLAR_NETWORK` | `testnet` | `public` |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | mainnet RPC |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| `ESCROW_WASM_HASH` | Testnet hash (Phase 1) | mainnet hash |
| `NATIVE_SAC_ADDRESS` | Testnet native SAC | mainnet native SAC |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | same |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | same |
| `SESSION_SECRET` / `CSRF_SECRET` | generated (≥32 chars) | generated |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / **rotated** (§5) | `admin` / **rotated** |
| `APP_URL` | Railway web public URL | prod URL |
| `S3_ENDPOINT` | file-storage internal URL | same |
| `S3_REGION` | `us-east-1` | same |
| `S3_BUCKET` | `ggg-uploads` | same |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | MinIO creds | object-store creds |
| `S3_FORCE_PATH_STYLE` | `true` | per provider |

Nothing sensitive is committed — only `apps/web/.env.example` is in the repo;
`.env` is gitignored.

## 5. Rotate the seeded admin password

The seed upserts an admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD`. In every
shared/deployed environment, rotate off the `.env.example` default:

1. Set a strong `ADMIN_PASSWORD` Railway variable on the web service.
2. Re-run the release (redeploy) so the idempotent `prisma db seed` re-hashes it
   (argon2).
3. Verify: log in with the new password; confirm the default is rejected.

## 6. CI & branch protection

CI (`.github/workflows/ci.yml`) gates merge with two jobs:

- **`app`** — Postgres 17 + Redis 7 service containers, `prisma migrate deploy`,
  typecheck, lint, prettier, unit + integration tests, `pnpm audit --audit-level high`.
- **`contract`** — `stellar contract build` + `cargo test`.

A maintainer enables branch protection once (requires repo admin; cannot be set
from CI). The repository's default branch is **`develop`** — protect that branch
(adjust if/when `main` becomes the release branch):

```bash
gh api -X PUT repos/:owner/:repo/branches/develop/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=app' \
  -F 'required_status_checks.contexts[]=contract' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions=
```

**Playwright E2E is NOT a PR gate** — it depends on Friendbot + live Testnet and
is non-deterministic for merge gating. Run it out-of-band (scheduled/manual).

## 7. E2E wallet fixture (why a stub)

The Freighter browser extension cannot load in headless Chromium and exposes no
programmatic signing API outside its popup. Phase 4d's client calls
`@stellar/freighter-api`, which reads `window.freighterApi`. The fixture
(`apps/web/e2e/fixtures/wallet.ts`) injects a `window.freighterApi`-shaped object
via `context.addInitScript` **before app JS runs**, backed by a real Friendbot-
funded Testnet `Keypair`. Signing is delegated to a Node `exposeFunction` (the
`@stellar/stellar-sdk` runs server-side in the fixture) — so the page only
forwards unsigned XDR and receives signed XDR, exactly Phase 4d's contract. The
signing is genuine (real XDR, real network submission); only the extension prompt
is replaced.

```bash
# from apps/web, with a running app and Testnet env:
APP_URL=<web url> pnpm --filter web exec playwright install chromium
APP_URL=<web url> pnpm --filter web exec playwright test
```

`e2e/global-setup.ts` funds organizer/referee/3 players via Friendbot once per
run and writes `.e2e/keys.json` (gitignored — Testnet secrets).

## 8. Acceptance — the six SPEC §15 criteria

Run against the deployed Testnet (`APP_URL=<railway web url>`). The demo-path and
cancel-refund specs (#83/#84) automate criteria 1–6; cross-check the explorer
links manually. The detailed per-criterion checklist lives in
[`docs/acceptance-spec-15.md`](docs/acceptance-spec-15.md).

| # | Criterion | Command / check | Expected | Outcome |
|---|---|---|---|---|
| 1 | Create → contract + QR | `playwright test e2e/demo-path.spec.ts` | status ACTIVE, `C…` contract id, QR rendered | ⏳ pending live deploy (#88) |
| 2 | Multiple joins update live | same run (3 `participant-row`, pool ticks to 30 XLM via SSE) | real-time participant + pool updates | ⏳ pending live deploy (#88) |
| 3 | Finalize pays 60/30/10 | same run (3 `payout-row`: 18 / 9 / 3 XLM from one finalisation) | one finalize tx, three transfers (dust to 1st) | ⏳ pending live deploy (#88) |
| 4 | Three explorer links | same run (`explorer-link` hrefs match `stellar.expert/explorer/testnet/tx/<64hex>`) | three valid, clickable tx links | ⏳ pending live deploy (#88) |
| 5 | Cancel refunds all + CANCELLED | `playwright test e2e/cancel-refund.spec.ts` | status chip CANCELLED, one `refund-row` per player | ⏳ pending live deploy (#88) |
| 6 | Happy path < 2 min | demo-path runs within Playwright's 120s `timeout`; also stopwatch one manual run | well under 120s | ⏳ pending live deploy (#88) |

Paste each pass/fail, elapsed time, and a sample explorer URL into the Outcome
column once verified on the deployed environment. **Verified locally so far:** the
NextAuth login seam and every `data-testid` the specs query (see
`docs/acceptance-spec-15.md` → "verified locally"); only the on-chain run remains.

## 9. Rollback

- Redeploy the previous Railway deployment (Railway keeps deployment history).
- Migrations are **forward-only** — never edit an applied migration; to revert a
  schema change, add a new migration that undoes it and redeploy.
