# Phase 6 — Hardening & Ship Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GGG shippable — prove the full SPEC §15 demo path and cancel→refund end-to-end with Playwright against Testnet, gate every merge behind a complete CI pipeline, lock down HTTP security headers, deploy the three Railway services (web, subscriber, file-storage) on Postgres 17 + Redis, and verify all six acceptance criteria on a live Testnet environment.

**Architecture:** Phase 6 adds no product features; it wraps the existing app (Phases 0–5) in test, CI, security, and deployment layers. Playwright drives the real Next.js app against Stellar Testnet, with a deterministic wallet fixture that stubs Freighter's browser-extension signing (the extension cannot run headless) by injecting a `window.freighterApi`-compatible shim backed by a funded Testnet keypair. GitHub Actions runs typecheck/lint/unit/integration (with Postgres + Redis service containers)/`pnpm audit`/contract build+`cargo test` as required merge gates. Railway hosts three services from the one monorepo, sharing one Postgres 17 plugin and one Redis plugin, with `prisma migrate deploy && prisma db seed` on web release.

**Tech Stack:** Playwright (E2E + wallet fixture), GitHub Actions (CI gates + service containers), Railway (Postgres 17, Redis, 3 service deploys, release command), Next.js 16 `next.config.ts` `headers()` + `proxy.ts` (CSP/HSTS/frame), pnpm 10 (`pnpm audit`, `pnpm -r test`), Vitest (unit/integration from Phases 2–5), `cargo test` + `stellar contract build` (Phase 1), `@stellar/stellar-sdk` 15 + Friendbot (fixture funding), `argon2` (admin rotation seed).

## Global Constraints
- CI gates (typecheck, lint, unit, integration, `pnpm audit`, contract build + `cargo test`) block merge on any failure — branch protection requires all green.
- Every schema change ships a NEW Prisma migration; never edit an applied migration — Phase 6 adds none but the release command must run `prisma migrate deploy` against committed migrations only.
- Secrets only via env / Railway variables; nothing sensitive is committed — `.env` stays gitignored, only `.env.example` is in the repo.
- Rotate the seeded admin password off the default in every shared/deployed environment via the Railway `ADMIN_PASSWORD` variable, then re-seed.
- Strict Content-Security-Policy plus `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, and frame protections (`X-Frame-Options` + CSP `frame-ancestors`) on every response.
- `pnpm audit` is clean (no advisories at or above `high`) and runs as a gating CI step.
- E2E covers BOTH the §15 demo path (create→join×N→finalize→3 payouts with explorer links) AND cancel→refund.
- Definition-of-done per AGENT §10: tests incl. failure cases, Zod-validated inputs, non-leaky errors, brand/accessibility compliance, no secret in client or repo, `pnpm audit` clean, contract-enforced fund rules with passing contract tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/playwright.config.ts` | Playwright config: Testnet baseURL, single Chromium project, web server boot, global setup hook, 120s test timeout to match the sub-two-minute criterion. |
| `apps/web/e2e/global-setup.ts` | Funds the fixture keypairs via Friendbot once per run; writes their secret/public keys to a storage state file consumed by the wallet fixture. |
| `apps/web/e2e/fixtures/wallet.ts` | Playwright test fixture that injects a `window.freighterApi` shim (init script) backed by a Testnet `Keypair`, implementing `isConnected/requestAccess/getAddress/getNetwork/signTransaction`. Documented stub for the headless-extension gap. |
| `apps/web/e2e/fixtures/auth.ts` | Helper to register/login an organiser via the real `/api/auth/*` routes and return an authenticated browser context. |
| `apps/web/e2e/demo-path.spec.ts` | The §15 happy path: create→join×3→finalize→assert 3 payout rows, amounts (60/30/10), and Stellar.Expert explorer links; asserts under two minutes. |
| `apps/web/e2e/cancel-refund.spec.ts` | Cancel→refund path: create→join×2→cancel→assert status CANCELLED and a refund event per player. |
| `.github/workflows/ci.yml` | CI: typecheck, lint, unit + integration (Postgres 17 + Redis service containers), `pnpm audit`, contract build + `cargo test`. Required for merge. |
| `apps/web/next.config.ts` | Adds `headers()` returning the strict CSP + security header set for all routes (modify existing Phase 0 config). |
| `apps/web/src/lib/security/headers.ts` | Single source of truth for the header name/value pairs, imported by `next.config.ts` and asserted by the header test. |
| `apps/web/src/lib/security/__tests__/headers.test.ts` | Integration test booting the app and asserting every required security header is present with the exact expected value. |
| `apps/web/railway.json` | Railway config for the **web** service: build (`pnpm --filter web build`), start (`pnpm --filter web start`), release (`prisma migrate deploy && prisma db seed`). |
| `apps/subscriber/railway.json` | Railway config for the **subscriber** service: build + start (`pnpm --filter subscriber start`), no release migrations. |
| `infra/file-storage/railway.json` | Railway config for the **file-storage** (MinIO) service backed by a Railway Volume. |
| `infra/file-storage/Dockerfile` | MinIO image + bucket bootstrap for the Railway file-storage service. |
| `RUNBOOK.md` | Deploy + acceptance runbook: Railway provisioning, per-env variables, admin-password rotation, and the six §15 acceptance checks with expected outcomes. |

---

### Task 1: Playwright harness + documented Freighter wallet fixture
**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/fixtures/wallet.ts`, `apps/web/e2e/fixtures/auth.ts`
- Modify: `apps/web/package.json` (add `@playwright/test` dev dep + `e2e` script)
- Test: the fixture is exercised by Task 2/3 specs

**Interfaces:** Consumes: the full app — `/register`, `/login`, `/tournaments/new`, `/tournaments/[id]`, `/tournaments/[id]/settle`, `/api/auth/*`, the Freighter `ensureWallet` pattern from Phase 4d, Testnet env (`NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL`). Produces: the E2E suite's config, Friendbot funding, and the wallet stub.

> **Why a stub:** the Freighter browser extension cannot load in headless Chromium and exposes no programmatic signing API outside the extension popup. Phase 4d's client code calls `@stellar/freighter-api`, which reads `window.freighterApi`. The fixture injects a `window.freighterApi`-shaped object via `context.addInitScript` BEFORE app JS runs, backed by a real Testnet `Keypair`, so signing is genuine (real XDR, real network submission) while the UI prompt is replaced. This is the documented, accepted seam for headless E2E.

- [ ] **Step 1: Add the Playwright dependency.** Run `pnpm --filter web add -D @playwright/test && pnpm --filter web exec playwright install chromium`. Expected: dep added to `apps/web/package.json`, Chromium downloaded.
- [ ] **Step 2: Add the `e2e` script.** In `apps/web/package.json` `scripts`, add `"e2e": "playwright test"`. Expected: `pnpm --filter web run e2e --list` lists specs once they exist.
- [ ] **Step 3: Write `playwright.config.ts`.** Create the file with this exact content:
  ```ts
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/global-setup.ts",
    timeout: 120_000, // matches the SPEC §15 sub-two-minute happy path
    expect: { timeout: 30_000 },
    fullyParallel: false, // shared Testnet contracts must not race
    workers: 1,
    retries: 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
      baseURL: process.env.APP_URL ?? "http://localhost:3000",
      trace: "on-first-retry",
      video: "retain-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: "pnpm --filter web start",
      url: process.env.APP_URL ?? "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  });
  ```
- [ ] **Step 4: Write `e2e/global-setup.ts`** to fund fixture keypairs via Friendbot once and persist them:
  ```ts
  import { Keypair } from "@stellar/stellar-sdk";
  import { writeFileSync, mkdirSync } from "node:fs";

  const FRIENDBOT = "https://friendbot.stellar.org";

  async function fund(kp: Keypair) {
    const res = await fetch(`${FRIENDBOT}?addr=${kp.publicKey()}`);
    if (!res.ok && res.status !== 400) {
      throw new Error(`Friendbot failed for ${kp.publicKey()}: ${res.status}`);
    }
  }

  export default async function globalSetup() {
    // organizer, referee, three players — all real Testnet accounts
    const roles = ["organizer", "referee", "player1", "player2", "player3"] as const;
    const keys: Record<string, { public: string; secret: string }> = {};
    for (const role of roles) {
      const kp = Keypair.random();
      await fund(kp);
      keys[role] = { public: kp.publicKey(), secret: kp.secret() };
    }
    mkdirSync(".e2e", { recursive: true });
    writeFileSync(".e2e/keys.json", JSON.stringify(keys, null, 2));
  }
  ```
- [ ] **Step 5: Write `e2e/fixtures/wallet.ts`** — the Freighter shim fixture:
  ```ts
  import { test as base } from "@playwright/test";
  import { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
  import { readFileSync } from "node:fs";

  type Keys = Record<string, { public: string; secret: string }>;
  const keys: Keys = JSON.parse(readFileSync(".e2e/keys.json", "utf8"));
  const PASSPHRASE = process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

  export const test = base.extend<{ asWallet: (role: keyof Keys) => Promise<void> }>({
    asWallet: async ({ context }, use) => {
      const install = async (role: keyof Keys) => {
        const k = keys[role];
        await context.addInitScript(
          ({ pub, secret, passphrase }) => {
            // injected before app JS; mirrors @stellar/freighter-api surface
            (window as any).__GGG_E2E_SIGN__ = { pub, secret, passphrase };
            (window as any).freighterApi = {
              isConnected: async () => ({ isConnected: true }),
              requestAccess: async () => ({ address: pub }),
              getAddress: async () => ({ address: pub }),
              getNetwork: async () => ({
                network: "TESTNET",
                networkPassphrase: passphrase,
              }),
              // signing is delegated to a Node-side route the app does NOT have;
              // instead we sign in-page using the embedded secret via the SDK bundle
              signTransaction: async (xdr: string) => {
                const sign = (window as any).__GGG_SIGN_XDR__;
                return { signedTxXdr: await sign(xdr, secret, passphrase) };
              },
            };
          },
          { pub: k.public, secret: k.secret, passphrase: PASSPHRASE },
        );
        // expose a real signer in page context (uses the app's bundled SDK)
        await context.exposeFunction(
          "__GGG_SIGN_XDR__",
          (xdr: string, secret: string, passphrase: string) => {
            const tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
            tx.sign(Keypair.fromSecret(secret));
            return tx.toXDR();
          },
        );
      };
      await use(install);
    },
  });

  export const keypairs = keys;
  export const expect = test.expect;
  ```
  > Signing happens in Node via `exposeFunction` (the SDK runs server-side in the fixture), so no secret-key crypto needs to be bundled into the page; the page only forwards the unsigned XDR and receives signed XDR — exactly Phase 4d's contract.
- [ ] **Step 6: Write `e2e/fixtures/auth.ts`** to register + log in an organiser through the real API:
  ```ts
  import type { BrowserContext } from "@playwright/test";

  export async function registerAndLogin(
    ctx: BrowserContext,
    username: string,
    password: string,
  ) {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await ctx.request.post(`${base}/api/auth/register`, {
      data: { username, password },
    });
    const res = await ctx.request.post(`${base}/api/auth/login`, {
      data: { username, password },
    });
    if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
    // session cookie now stored in ctx
  }
  ```
- [ ] **Step 7: Verify the harness boots.** Run `APP_URL=http://localhost:3000 pnpm --filter web exec playwright test --list`. Expected: lists the spec files (empty for now is fine — confirms config + globalSetup load without error).
- [ ] **Step 8: Commit.** `git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json && git commit -m "Phase 6: Playwright harness + documented Freighter wallet fixture"`.

### Task 2: E2E demo path — create→join×3→finalize→3 payouts (TDD: write spec first, expect FAIL, wire, expect PASS)
**Files:**
- Create: `apps/web/e2e/demo-path.spec.ts`
- Modify: `apps/web/e2e/fixtures/wallet.ts` (only if a selector/seam gap surfaces)

**Interfaces:** Consumes: `/tournaments/new` form (name, gameTitle, entryFee, asset, refereeAddress, split 60/30/10), `POST /api/tournaments` + `/submit` (deploy), `/tournaments/[id]` (QR + Join), `POST .../join`, `/tournaments/[id]/settle`, `POST .../finalize`, SSE `/api/tournaments/[id]/events`, the Stellar.Expert URL builder from Phase 2. Produces: the §15 acceptance criteria 1–4 + 6 as an automated test.

- [ ] **Step 1: Write the spec FIRST (it will fail until wired).** Create `apps/web/e2e/demo-path.spec.ts`:
  ```ts
  import { test, expect, keypairs } from "./fixtures/wallet";
  import { registerAndLogin } from "./fixtures/auth";

  test("demo path: create -> join x3 -> finalize -> 3 payouts (60/30/10) with explorer links", async ({
    page,
    context,
    asWallet,
  }) => {
    const started = Date.now();
    await registerAndLogin(context, `org_${Date.now()}`, "Sup3r$ecret!pw");
    await asWallet("organizer");

    // --- create (criterion 1) ---
    await page.goto("/tournaments/new");
    await page.getByLabel("Tournament name").fill("E2E Cup");
    await page.getByLabel("Game title").fill("Rocket League");
    await page.getByLabel("Entry fee").fill("10"); // 10 XLM
    await page.getByLabel("Referee wallet address").fill(keypairs.referee.public);
    await page.getByLabel(/first/i).fill("60");
    await page.getByLabel(/second/i).fill("30");
    await page.getByLabel(/third/i).fill("10");
    await page.getByRole("button", { name: /create tournament/i }).click();

    // deploy confirmed -> redirected to detail with a C... contract + QR
    await expect(page).toHaveURL(/\/tournaments\/[a-z0-9]+$/i);
    await expect(page.getByText(/^C[A-Z2-7]{55}$/)).toBeVisible(); // contract id
    await expect(page.getByTestId("join-qr")).toBeVisible(); // criterion 1: QR

    const detailUrl = page.url();

    // --- join x3 (criterion 2) ---
    for (const role of ["player1", "player2", "player3"] as const) {
      await asWallet(role);
      await page.goto(detailUrl);
      await page.getByRole("button", { name: /^join$/i }).click();
      await expect(
        page.getByTestId("participant-row").filter({ hasText: keypairs[role].public.slice(0, 6) }),
      ).toBeVisible({ timeout: 60_000 }); // live SSE update
    }
    await expect(page.getByTestId("participant-row")).toHaveCount(3);
    await expect(page.getByTestId("pool-amount")).toHaveText(/30(\.0+)?\s*XLM/); // 3 x 10

    // --- finalize (criterion 3) ---
    await asWallet("referee");
    await page.goto(`${detailUrl}/settle`);
    await page.getByLabel(/1st|first/i).fill(keypairs.player1.public);
    await page.getByLabel(/2nd|second/i).fill(keypairs.player2.public);
    await page.getByLabel(/3rd|third/i).fill(keypairs.player3.public);
    await page.getByRole("button", { name: /finalize/i }).click();

    await page.goto(detailUrl);
    const payouts = page.getByTestId("payout-row");
    await expect(payouts).toHaveCount(3, { timeout: 60_000 }); // criterion 3

    // amounts: pool 30 XLM -> 18 / 9 / 3 (criterion 3)
    await expect(payouts.nth(0)).toContainText(/18(\.0+)?\s*XLM/);
    await expect(payouts.nth(1)).toContainText(/9(\.0+)?\s*XLM/);
    await expect(payouts.nth(2)).toContainText(/3(\.0+)?\s*XLM/);

    // explorer links (criterion 4): three distinct stellar.expert tx links
    const links = page.getByTestId("explorer-link");
    await expect(links).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(links.nth(i)).toHaveAttribute(
        "href",
        /stellar\.expert\/explorer\/testnet\/tx\/[a-f0-9]{64}/,
      );
    }

    // criterion 6: well under two minutes
    expect(Date.now() - started).toBeLessThan(120_000);
  });
  ```
- [ ] **Step 2: Run it and expect FAIL.** Run `pnpm --filter web exec playwright test e2e/demo-path.spec.ts`. Expected: FAIL — selectors/`data-testid`s likely missing on the Phase 4/5 pages.
- [ ] **Step 3: Wire the page seams.** Add the `data-testid` hooks the spec relies on to the existing components (do not change behavior): `join-qr` on the QR card, `participant-row` on each participant list item, `pool-amount` on the live counter, `payout-row` + `explorer-link` on the finished-state winners list, and ensure form labels match (`Tournament name`, `Game title`, `Entry fee`, `Referee wallet address`, split inputs). These live in the Phase 4c `/tournaments/[id]` and `/settle` components and the Phase 5 live-feed components.
- [ ] **Step 4: Run again and expect PASS.** Run `pnpm --filter web exec playwright test e2e/demo-path.spec.ts`. Expected: 1 passed. If a join is slow, the 60s sub-timeouts absorb network latency while the overall 120s bound still asserts criterion 6.
- [ ] **Step 5: Commit.** `git add apps/web/e2e/demo-path.spec.ts apps/web/src/components && git commit -m "Phase 6: E2E demo path (create->join x3->finalize->payouts+explorer links)"`.

### Task 3: E2E cancel→refund path (TDD)
**Files:**
- Create: `apps/web/e2e/cancel-refund.spec.ts`

**Interfaces:** Consumes: create + join flow (Task 2), the organiser-only Cancel control on `/tournaments/[id]`, `POST /api/tournaments/[id]/cancel`, the `cancelled` event surfaced via SSE/`ContractEvent`. Produces: §15 acceptance criterion 5 as an automated test.

- [ ] **Step 1: Write the spec FIRST.** Create `apps/web/e2e/cancel-refund.spec.ts`:
  ```ts
  import { test, expect, keypairs } from "./fixtures/wallet";
  import { registerAndLogin } from "./fixtures/auth";

  test("cancel path: create -> join x2 -> cancel -> all refunded, status CANCELLED", async ({
    page,
    context,
    asWallet,
  }) => {
    await registerAndLogin(context, `org_${Date.now()}`, "Sup3r$ecret!pw");
    await asWallet("organizer");

    await page.goto("/tournaments/new");
    await page.getByLabel("Tournament name").fill("Cancel Cup");
    await page.getByLabel("Game title").fill("CS2");
    await page.getByLabel("Entry fee").fill("5");
    await page.getByLabel("Referee wallet address").fill(keypairs.referee.public);
    await page.getByLabel(/first/i).fill("60");
    await page.getByLabel(/second/i).fill("30");
    await page.getByLabel(/third/i).fill("10");
    await page.getByRole("button", { name: /create tournament/i }).click();
    await expect(page).toHaveURL(/\/tournaments\/[a-z0-9]+$/i);
    const detailUrl = page.url();

    for (const role of ["player1", "player2"] as const) {
      await asWallet(role);
      await page.goto(detailUrl);
      await page.getByRole("button", { name: /^join$/i }).click();
      await expect(
        page.getByTestId("participant-row").filter({ hasText: keypairs[role].public.slice(0, 6) }),
      ).toBeVisible({ timeout: 60_000 });
    }
    await expect(page.getByTestId("participant-row")).toHaveCount(2);

    // --- cancel (criterion 5) ---
    await asWallet("organizer");
    await page.goto(detailUrl);
    await page.getByRole("button", { name: /^cancel/i }).click();
    await page.getByRole("button", { name: /confirm/i }).click();

    await expect(page.getByTestId("status-chip")).toHaveText(/cancelled/i, {
      timeout: 60_000,
    });
    // one refund event per joined player (criterion 5)
    await expect(page.getByTestId("refund-row")).toHaveCount(2, { timeout: 60_000 });
  });
  ```
- [ ] **Step 2: Run and expect FAIL.** Run `pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts`. Expected: FAIL — `status-chip`/`refund-row`/`cancel`+`confirm` controls likely missing test hooks.
- [ ] **Step 3: Wire the seams.** Add `data-testid="status-chip"` to the status chip, a Cancel→confirm dialog with `Confirm` button on the organiser-gated detail panel, and `data-testid="refund-row"` to refund entries derived from the `cancelled` `ContractEvent` (Phase 5 subscriber persists refund count/per-player refunds; render one row per refunded player).
- [ ] **Step 4: Run and expect PASS.** Run `pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts`. Expected: 1 passed.
- [ ] **Step 5: Run the full E2E suite.** Run `pnpm --filter web exec playwright test`. Expected: 2 passed (demo + cancel).
- [ ] **Step 6: Commit.** `git add apps/web/e2e/cancel-refund.spec.ts apps/web/src/components && git commit -m "Phase 6: E2E cancel->refund path"`.

### Task 4: Security headers (TDD: failing header test → implement → pass)
**Files:**
- Create: `apps/web/src/lib/security/headers.ts`, `apps/web/src/lib/security/__tests__/headers.test.ts`
- Modify: `apps/web/next.config.ts` (Phase 0), `apps/web/proxy.ts` (Phase 3 — ensure headers also apply to any middleware-handled responses)

**Interfaces:** Consumes: the running Next.js app (all routes), the Freighter/Stellar client origins the CSP must allow (`https://soroban-testnet.stellar.org`, `https://horizon-testnet.stellar.org`, `https://*.stellar.org`, `https://stellar.expert`), the S3/MinIO image origin. Produces: the AGENT §7 header set (CSP, X-Content-Type-Options, Referrer-Policy, HSTS, frame protections).

- [ ] **Step 1: Write the failing test FIRST.** Create `apps/web/src/lib/security/__tests__/headers.test.ts`:
  ```ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { spawn, type ChildProcess } from "node:child_process";

  let server: ChildProcess;
  const BASE = "http://localhost:3100";

  beforeAll(async () => {
    server = spawn("pnpm", ["--filter", "web", "start", "-p", "3100"], {
      stdio: "inherit",
      env: { ...process.env, PORT: "3100" },
    });
    // poll until up
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(BASE);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error("server did not start");
  }, 90_000);

  afterAll(() => server?.kill("SIGTERM"));

  describe("security headers", () => {
    it("sets the full hardening header set on /", async () => {
      const res = await fetch(BASE);
      const h = res.headers;
      expect(h.get("content-security-policy")).toContain("default-src 'self'");
      expect(h.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(h.get("strict-transport-security")).toBe(
        "max-age=63072000; includeSubDomains; preload",
      );
      expect(h.get("x-frame-options")).toBe("DENY");
      expect(h.get("permissions-policy")).toContain("camera=()");
    });
  });
  ```
- [ ] **Step 2: Run and expect FAIL.** Run `pnpm --filter web exec vitest run src/lib/security/__tests__/headers.test.ts`. Expected: FAIL — headers absent.
- [ ] **Step 3: Define the header set.** Create `apps/web/src/lib/security/headers.ts` with the EXACT concrete values:
  ```ts
  // Concrete, app-specific CSP. connect-src/img-src allow the Stellar RPC/Horizon,
  // the explorer, and the S3/MinIO image origin; everything else is locked to self.
  const CSP = [
    "default-src 'self'",
    // Next.js 16 needs inline/runtime; keep script tight, no remote script hosts.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'", // Tailwind v4 + Material Symbols font CSS
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://stellar.expert " +
      (process.env.S3_PUBLIC_ORIGIN ?? "http://localhost:9000"),
    "connect-src 'self' https://*.stellar.org https://soroban-testnet.stellar.org " +
      "https://horizon-testnet.stellar.org https://soroban-rpc.mainnet.stellar.gateway.fm " +
      "https://horizon.stellar.org https://stellar.expert",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  export const SECURITY_HEADERS: { key: string; value: string }[] = [
    { key: "Content-Security-Policy", value: CSP },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
  ];
  ```
- [ ] **Step 4: Wire into `next.config.ts`.** Add an async `headers()` that returns `SECURITY_HEADERS` for the source `"/:path*"`:
  ```ts
  import { SECURITY_HEADERS } from "./src/lib/security/headers";
  // inside the config object:
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  ```
- [ ] **Step 5: Run and expect PASS.** Run `pnpm --filter web build && pnpm --filter web exec vitest run src/lib/security/__tests__/headers.test.ts`. Expected: 1 passed (build required because the test runs `next start`).
- [ ] **Step 6: Verify CSRF + rate-limit coverage (defense-in-depth from Phase 3).** Run the Phase 3 integration tests that assert CSRF rejection and rate limiting: `pnpm --filter web exec vitest run src/lib/auth src/lib/redis`. Expected: existing CSRF (origin/double-submit) and rate-limit tests pass; if any cookie-authed mutation route lacks coverage, add a test asserting a cross-origin POST without a CSRF token returns 403.
- [ ] **Step 7: Commit.** `git add apps/web/src/lib/security apps/web/next.config.ts && git commit -m "Phase 6: strict CSP + security headers with assertion test"`.

### Task 5: `pnpm audit` clean
**Files:**
- Modify: `apps/web/package.json`, `apps/subscriber/package.json`, root `package.json`, `pnpm-lock.yaml` (as needed)

**Interfaces:** Consumes: the full dependency tree across the workspace. Produces: a clean `pnpm audit` that the CI gate (Task 6) can enforce.

- [ ] **Step 1: Run the audit.** Run `pnpm audit --audit-level high`. Expected: either "No known vulnerabilities found" or a list to remediate.
- [ ] **Step 2: Remediate.** For any advisory at `high`/`critical`, run `pnpm update <pkg> --latest` (or add a justified `pnpm.overrides` entry in root `package.json` pinning a patched transitive version). Re-run after each change.
- [ ] **Step 3: Re-verify.** Run `pnpm audit --audit-level high`. Expected: exit code 0, "No known vulnerabilities found".
- [ ] **Step 4: Commit.** `git add package.json pnpm-lock.yaml apps/*/package.json && git commit -m "Phase 6: pnpm audit clean (remediate advisories)"`.

### Task 6: CI gates (GitHub Actions) — block merge on failure
**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: root `package.json` (ensure `typecheck`, `lint`, `test` scripts exist workspace-wide if missing from Phase 0)

**Interfaces:** Consumes: workspace scripts (`typecheck`, `lint`, `pnpm -r test`), Postgres 17 + Redis (service containers), `pnpm audit`, the Rust contract (`stellar contract build` + `cargo test`). Produces: the required merge-gating CI workflow.

- [ ] **Step 1: Write `.github/workflows/ci.yml` with the EXACT content:**
  ```yaml
  name: CI
  on:
    pull_request:
    push:
      branches: [main]

  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    app:
      runs-on: ubuntu-latest
      services:
        postgres:
          image: postgres:17
          env:
            POSTGRES_USER: ggg
            POSTGRES_PASSWORD: ggg
            POSTGRES_DB: ggg_test
          ports: ["5432:5432"]
          options: >-
            --health-cmd "pg_isready -U ggg"
            --health-interval 5s --health-timeout 5s --health-retries 10
        redis:
          image: redis:7
          ports: ["6379:6379"]
          options: >-
            --health-cmd "redis-cli ping"
            --health-interval 5s --health-timeout 5s --health-retries 10
      env:
        DATABASE_URL: postgresql://ggg:ggg@localhost:5432/ggg_test
        REDIS_URL: redis://localhost:6379
        NODE_ENV: test
        SESSION_SECRET: ci_session_secret_ci_session_secret_32b
        CSRF_SECRET: ci_csrf_secret_ci_csrf_secret_ci_csrf
        ADMIN_USERNAME: admin
        ADMIN_PASSWORD: ci_admin_pw_change_me
        STELLAR_NETWORK: testnet
        SOROBAN_RPC_URL: https://soroban-testnet.stellar.org
        HORIZON_URL: https://horizon-testnet.stellar.org
        NETWORK_PASSPHRASE: "Test SDF Network ; September 2015"
        ESCROW_WASM_HASH: ${{ secrets.ESCROW_WASM_HASH }}
        NATIVE_SAC_ADDRESS: ${{ secrets.NATIVE_SAC_ADDRESS }}
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
          with: { version: 10 }
        - uses: actions/setup-node@v4
          with: { node-version: 22, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm --filter web prisma migrate deploy
        - run: pnpm typecheck
        - run: pnpm lint
        - run: pnpm -r test
        - run: pnpm audit --audit-level high

    contract:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: dtolnay/rust-toolchain@stable
          with: { targets: wasm32v1-none }
        - name: Install stellar-cli
          run: cargo install --locked stellar-cli@^22 || cargo install --locked soroban-cli
        - name: Contract build
          run: cd contracts/escrow && stellar contract build
        - name: Contract tests
          run: cd contracts/escrow && cargo test
  ```
  > E2E (Playwright against Testnet) is run on a schedule/manual workflow, not the PR gate, because it depends on Friendbot + live Testnet and is non-deterministic for merge gating; the PR gate covers typecheck/lint/unit/integration/audit/contract. (Document this in RUNBOOK.)
- [ ] **Step 2: Local pre-flight verification** mirroring the gate. Run:
  ```bash
  pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --audit-level high && (cd contracts/escrow && cargo test)
  ```
  Expected: all commands exit 0 (typecheck/lint clean, all Vitest + integration suites pass against local Postgres+Redis from `docker compose up -d`, audit clean, `cargo test` green covering all contract invariants).
- [ ] **Step 3: Push the branch and confirm CI runs both jobs.** Run `git push -u origin <branch>` and `gh run watch`. Expected: `app` and `contract` jobs both succeed.
- [ ] **Step 4: Enable branch protection (gating).** Run:
  ```bash
  gh api -X PUT repos/:owner/:repo/branches/main/protection \
    -F required_status_checks.strict=true \
    -F 'required_status_checks.contexts[]=app' \
    -F 'required_status_checks.contexts[]=contract' \
    -F enforce_admins=true \
    -F required_pull_request_reviews.required_approving_review_count=1 \
    -F restrictions=
  ```
  Expected: merges to `main` now blocked unless `app` and `contract` are green.
- [ ] **Step 5: Commit.** `git add .github/workflows/ci.yml package.json && git commit -m "Phase 6: CI gates (typecheck/lint/test/audit/contract) gating merge"`.

### Task 7: Railway deploy config — web, subscriber, file-storage on Postgres 17 + Redis
**Files:**
- Create: `apps/web/railway.json`, `apps/subscriber/railway.json`, `infra/file-storage/railway.json`, `infra/file-storage/Dockerfile`
- Modify: `RUNBOOK.md` (provisioning checklist — created fully in Task 9)

**Interfaces:** Consumes: `pnpm build`/`pnpm start` for web + subscriber, Prisma migrations + `seed.ts`, the S3 client config (`S3_ENDPOINT`/bucket/keys), per-env `STELLAR_*`/`NETWORK_PASSPHRASE`/`ESCROW_WASM_HASH`/`NATIVE_SAC_ADDRESS`. Produces: three Railway service configs + release command.

- [ ] **Step 1: Web service config.** Create `apps/web/railway.json`:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
      "builder": "NIXPACKS",
      "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter web build"
    },
    "deploy": {
      "startCommand": "pnpm --filter web start",
      "preDeployCommand": "pnpm --filter web prisma migrate deploy && pnpm --filter web prisma db seed",
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3,
      "healthcheckPath": "/api/auth/me"
    }
  }
  ```
  > `preDeployCommand` is Railway's release hook — it runs `prisma migrate deploy && prisma db seed` before the new web container takes traffic, exactly per AGENT §9 / SPEC §14.
- [ ] **Step 2: Subscriber service config.** Create `apps/subscriber/railway.json`:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
      "builder": "NIXPACKS",
      "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter subscriber build"
    },
    "deploy": {
      "startCommand": "pnpm --filter subscriber start",
      "restartPolicyType": "ALWAYS"
    }
  }
  ```
  > No migrations here — the web service owns schema; the subscriber only reads/writes data and shares the same `DATABASE_URL`/`REDIS_URL`. `restartPolicyType: ALWAYS` keeps the long-running poller alive.
- [ ] **Step 3: File-storage service.** Create `infra/file-storage/Dockerfile`:
  ```dockerfile
  FROM minio/minio:latest
  ENV MINIO_ROOT_USER=ggg
  EXPOSE 9000 9001
  VOLUME ["/data"]
  ENTRYPOINT ["sh", "-c", "minio server /data --console-address :9001"]
  ```
  and `infra/file-storage/railway.json`:
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": { "builder": "DOCKERFILE", "dockerfilePath": "infra/file-storage/Dockerfile" },
    "deploy": { "startCommand": "", "restartPolicyType": "ALWAYS" }
  }
  ```
  > Attach a **Railway Volume** mounted at `/data` (per SPEC §9); set `MINIO_ROOT_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` as Railway variables and create the `ggg-uploads` bucket on first boot.
- [ ] **Step 4: Provision data plugins (CLI).** Run:
  ```bash
  railway add --plugin postgresql
  railway add --plugin redis
  ```
  Expected: a Postgres 17 instance and a Redis instance, each exposing `DATABASE_URL` / `REDIS_URL` for reference by the web + subscriber services.
- [ ] **Step 5: Set per-environment variables (Testnet staging shown).** For the web + subscriber services set (via Railway dashboard or `railway variables --set`):
  ```
  STELLAR_NETWORK=testnet
  SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
  HORIZON_URL=https://horizon-testnet.stellar.org
  NETWORK_PASSPHRASE=Test SDF Network ; September 2015
  ESCROW_WASM_HASH=<hash recorded in Phase 1>
  NATIVE_SAC_ADDRESS=<native SAC for testnet>
  SESSION_SECRET=<generated>  CSRF_SECRET=<generated>
  DATABASE_URL=${{Postgres.DATABASE_URL}}  REDIS_URL=${{Redis.REDIS_URL}}
  ADMIN_USERNAME=admin  ADMIN_PASSWORD=<rotated, NOT the default>
  S3_ENDPOINT=<file-storage internal URL>  S3_BUCKET=ggg-uploads
  S3_ACCESS_KEY_ID=<...>  S3_SECRET_ACCESS_KEY=<...>  S3_FORCE_PATH_STYLE=true
  APP_URL=<railway web public URL>
  ```
  For the Public/prod environment, swap the four Stellar values to mainnet (`STELLAR_NETWORK=public`, `NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015`, mainnet RPC/Horizon, mainnet `ESCROW_WASM_HASH` + `NATIVE_SAC_ADDRESS`).
- [ ] **Step 6: Rotate the seeded admin password.** After first deploy, set a strong `ADMIN_PASSWORD` variable (not the `.env.example` default), then re-run the release so `prisma db seed`'s idempotent `upsert` re-hashes it. Verify by logging in with the new password and confirming the default no longer works.
- [ ] **Step 7: Deploy verification checklist (expected outcomes):**
  - `railway up` for each of the three services → all reach "Active".
  - Web `preDeployCommand` logs show `prisma migrate deploy` applying migrations and `prisma db seed` upserting admin → no errors.
  - `GET https://<web>/api/auth/me` (healthcheck) returns 200/401 (app alive), not 5xx.
  - Subscriber logs show it polling `getEvents` for ACTIVE tournaments.
  - File-storage: `ggg-uploads` bucket exists; a presigned PUT from `/api/uploads` succeeds.
  - Admin login works with the rotated password; default password rejected.
- [ ] **Step 8: Commit.** `git add apps/web/railway.json apps/subscriber/railway.json infra/file-storage && git commit -m "Phase 6: Railway deploy config (web, subscriber, file-storage)"`.

### Task 8: Acceptance verification of the six SPEC §15 criteria on deployed Testnet
**Files:**
- Modify: `RUNBOOK.md` (record each check + outcome — file authored in Task 9)

**Interfaces:** Consumes: the live Testnet deployment from Task 7, the E2E suite from Tasks 2–3 (run against `APP_URL=<railway web url>`), Freighter (manual cross-check), Stellar.Expert. Produces: signed-off acceptance evidence for criteria 1–6.

- [ ] **Step 1: Criterion 1 — create + contract + QR.** Automated: run `APP_URL=<railway web url> pnpm --filter web exec playwright test e2e/demo-path.spec.ts` (covers create). Manual cross-check: in a real browser with Freighter on Testnet, create an XLM tournament → expect a `C...` contract id and a visible QR. Expected result: tournament status ACTIVE, contract deployed, QR rendered.
- [ ] **Step 2: Criterion 2 — multiple joins update live.** From the same demo-path run, three joins each appear as a `participant-row` and the `pool-amount` ticks to 30 XLM without a refresh (SSE). Manual cross-check: open the detail page in a second browser tab and watch the pool update as a join confirms. Expected: real-time participant + pool updates.
- [ ] **Step 3: Criterion 3 — finalize pays 60/30/10 in one finalisation.** The demo-path run asserts three payout rows with 18/9/3 XLM from a single `finalize_results`. Expected: one finalisation tx, three on-chain transfers summing to the 30 XLM pool (dust to 1st per contract).
- [ ] **Step 4: Criterion 4 — three explorer links.** The demo-path run asserts three `explorer-link` hrefs matching `stellar.expert/explorer/testnet/tx/<64hex>`. Manual cross-check: click each link → the transaction loads on Stellar.Expert. Expected: three linkable, valid payout transactions.
- [ ] **Step 5: Criterion 5 — cancel refunds all + CANCELLED.** Run `APP_URL=<railway web url> pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts`. Expected: status chip reads CANCELLED and one refund row per joined player; manual: confirm each player's Testnet balance increased by the entry fee on Stellar.Expert.
- [ ] **Step 6: Criterion 6 — happy path under two minutes.** The demo-path spec asserts `Date.now() - started < 120_000`. Record the actual elapsed time from the Playwright `list` reporter duration AND time one manual run with a stopwatch end-to-end (create → first explorer link visible). Expected: well under 120s.
- [ ] **Step 7: Record outcomes in RUNBOOK.** For each of the six criteria, paste the pass/fail + elapsed time + a sample explorer URL into the RUNBOOK acceptance table. Expected: all six PASS against deployed Testnet.

### Task 9: RUNBOOK.md — deploy + acceptance runbook
**Files:**
- Create: `RUNBOOK.md`

**Interfaces:** Consumes: Tasks 1–8 outputs. Produces: the operational runbook (provisioning, env matrix, admin rotation, fixture docs, acceptance table).

- [ ] **Step 1: Write `RUNBOOK.md`** with these sections, each populated with the concrete commands/values from the tasks above:
  1. **Prerequisites** — Railway project, `railway` CLI, `gh` CLI, recorded `ESCROW_WASM_HASH` + `NATIVE_SAC_ADDRESS` per network.
  2. **Provision data** — `railway add --plugin postgresql` (Postgres 17), `railway add --plugin redis`.
  3. **Deploy the three services** — web, subscriber, file-storage; the web `preDeployCommand` (`prisma migrate deploy && prisma db seed`); attach the file-storage Volume at `/data`.
  4. **Per-environment variable matrix** — the Testnet (staging/demo) vs Public (prod) table of `STELLAR_*`/`NETWORK_PASSPHRASE`/`ESCROW_WASM_HASH`/`NATIVE_SAC_ADDRESS`/S3/secrets.
  5. **Rotate the seeded admin password** — set Railway `ADMIN_PASSWORD`, re-run release, verify default rejected.
  6. **CI** — what gates merge (`app` + `contract` jobs), branch-protection note, and that Playwright E2E runs out-of-band (scheduled/manual) against Testnet.
  7. **E2E wallet fixture** — explain the Freighter-cannot-run-headless stub: `window.freighterApi` injected via `addInitScript`, signing delegated to a Node `exposeFunction` using a Friendbot-funded `Keypair`; how to run `pnpm --filter web exec playwright test`.
  8. **Acceptance table** — the six §15 criteria with command, expected result, and a slot for the recorded outcome (filled in Task 8).
  9. **Rollback** — redeploy previous Railway deployment; migrations are forward-only (never edit applied — add a new migration to revert).
- [ ] **Step 2: Verify the runbook is executable end-to-end** by following it on a fresh Testnet environment dry-run (or a reviewer walkthrough). Expected: a new operator can provision, deploy, rotate, and verify all six criteria using only the runbook.
- [ ] **Step 3: Commit.** `git add RUNBOOK.md && git commit -m "Phase 6: deploy + acceptance runbook"`.

### Task 10: Final definition-of-done sweep
**Files:** none (verification only)

**Interfaces:** Consumes: everything above. Produces: the Phase 6 "done" sign-off.

- [ ] **Step 1: Re-run the full local gate.** `pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --audit-level high && (cd contracts/escrow && cargo test)`. Expected: all exit 0.
- [ ] **Step 2: Re-run both E2E paths against deployed Testnet.** `APP_URL=<railway web url> pnpm --filter web exec playwright test`. Expected: 2 passed.
- [ ] **Step 3: Confirm CI is green and gating on a real PR.** Open a trivial PR; confirm merge is blocked until `app` + `contract` pass. Expected: gating enforced.
- [ ] **Step 4: Confirm all six §15 criteria are recorded PASS in `RUNBOOK.md`.** Expected: acceptance table complete, sub-two-minute time recorded.
- [ ] **Step 5: Confirm no secret in repo.** Run `git grep -nE 'SECRET_ACCESS_KEY|ADMIN_PASSWORD=|secret\(\)' -- ':!*.example' ':!*.md'`. Expected: no real secret values; only env references.
