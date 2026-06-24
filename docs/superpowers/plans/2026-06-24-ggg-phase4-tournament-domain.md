# Phase 4 — Tournament Domain (API + Pages) Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full tournament vertical — create/list/detail/join/finalize/cancel API route handlers, the Freighter client signing helper, S3 cover-image uploads, and every BRAND-compliant page (`/`, `/tournaments`, `/tournaments/new`, `/tournaments/[id]`, `/tournaments/[id]/settle`, `/admin`) — so an organiser creates a tournament end-to-end, a player joins, a referee finalizes, and an organiser cancels, each via client-side Freighter signing reconciled to confirmed on-chain state.

**Architecture:** Server Components are the default; `"use client"` lives only at interactive leaves (wallet button, QR card, prize counter, participant list, live feed, settlement console, forms). Route Handlers are thin (parse → authorize → delegate); business logic lives in `apps/web/src/server/services/tournaments.ts`. Zod schemas in `apps/web/src/lib/validation/tournament.ts` are shared verbatim between client forms and server handlers. Every on-chain mutation is: server builds + simulates an unsigned XDR → client `ensureWallet` + `signTransaction` → client POSTs signed XDR to `/submit` with an idempotency key → server submits + polls + persists confirmed state.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), React 19.2, `@stellar/freighter-api` 5, `qrcode.react`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Zod 4, shadcn/ui + Radix + `lucide-react` (+ Material Symbols Outlined), Vitest + Testing Library (unit/integration), Playwright (Phase 6 E2E — not here).

## Global Constraints
- Next 16 App Router; Server Components by default, `"use client"` only at interactive leaf components.
- The server never holds private keys — it builds, simulates, submits, and reads; all signing is client-side via Freighter.
- Always `simulate` before returning an XDR to the client (handled inside the Phase 2 builders); reject malformed XDR before submitting.
- Zod-validate every input: request bodies, route params, query params; validate `G…` (`stellarPublicKey`), `C…` (`stellarContractId`), amounts (`i128Amount`), and `distributionBps` summing to exactly `10000`.
- Money is `BigInt` end to end (token smallest unit; XLM = stroops); never float; serialize `BigInt` to string in JSON.
- Every response uses the `{ ok: boolean, data?, error? }` envelope via `ok()` / `err()` from `@/lib/api`.
- Idempotency keys are required on `POST .../submit`; dedupe submissions on the key + on `txHash`.
- Owner-scoped queries everywhere ownership applies (IDOR): `GET /api/tournaments` and every organiser mutation verify `tournament.organizerId === session.user.id` before acting.
- BRAND compliance on every page: kinetic-glass / brutalist-border surfaces, electric-violet primary irreversible buttons, acid-yellow for live/on-chain truth, `label-caps` mono labels, `data-mono` addresses.
- Accessibility floor: semantic HTML, AA contrast, visible violet focus ring, `prefers-reduced-motion` honoured for all BRAND §6 animations, responsive (top-nav → bottom tab bar).
- Reconcile UI against confirmed on-chain state; never mark funds moved on optimistic state — persist `contractId`/`status`/`txHash` only after `getTransaction` confirms success.

---

## File Structure

### Validation schemas (`apps/web/src/lib/validation/`)
- `tournament.ts` — `createTournamentSchema` (name, gameTitle, entryFee, asset, refereeAddress, organizerAddress, distributionBps tuple, coverImageKey?), `submitSchema` (signedXdr, intent), `joinSchema` (playerAddress), `finalizeSchema` (first, second, third), `listQuerySchema` (status?, cursor?, take?), `uploadSchema` (contentType, contentLength). Re-exports Phase 2 validators (`stellarPublicKey`, `stellarContractId`, `i128Amount`).

### Services (`apps/web/src/server/services/`)
- `tournaments.ts` — fat service: `createTournament(input, userId)`, `submitTournamentTx(id, input, userId)`, `listTournaments(userId, query)`, `getTournamentDetail(id)`, `buildJoin(id, playerAddress)`, `buildFinalize(id, input, walletAddress)`, `buildCancel(id, userId)`. Owns all Prisma reads/writes and calls into `@/lib/stellar`.
- `uploads.ts` — `createPresignedUpload(contentType, contentLength)`: validates MIME/size, generates a random object key, returns `{ uploadUrl, key }`.
- `idempotency.ts` — `withIdempotency(key, fn)`: Redis-backed dedupe wrapper for `/submit`.

### Client wallet helper (`apps/web/src/lib/wallet.ts`) — `"use client"`
- `ensureWallet(expectedPassphrase)` → `Promise<string>`: `isConnected` → `requestAccess` → `getAddress` → `getNetwork` passphrase check; returns the `G…` address.
- `signAndSubmit(unsignedXdr, intent, submitUrl)` → `Promise<SubmitResult>`: `ensureWallet` → `signTransaction` → POST signed XDR + idempotency key to `submitUrl`.

### Route handlers (`apps/web/src/app/api/`)
- `tournaments/route.ts` — `POST` (organiser: create DRAFT + build deploy/initialize XDR), `GET` (organiser: owner-scoped list, `?status=` + cursor pagination).
- `tournaments/[id]/route.ts` — `GET` (public: detail incl pool, participants, status, winners).
- `tournaments/[id]/submit/route.ts` — `POST` (organiser: idempotent submit of signed XDR; persist contractId + status on deploy intent).
- `tournaments/[id]/join/route.ts` — `POST` (public: build `join_tournament` XDR for `playerAddress`).
- `tournaments/[id]/finalize/route.ts` — `POST` (referee-gated: validate distinct+registered, build `finalize_results` XDR).
- `tournaments/[id]/cancel/route.ts` — `POST` (organiser-only, pre-finalisation: build `cancel_tournament` XDR).
- `uploads/route.ts` — `POST` (authenticated: presigned S3 PUT URL + object key).

### Pages (`apps/web/src/app/`)
- `page.tsx` — `/` landing: hero thesis + Create Tournament CTA (Server Component).
- `login/page.tsx`, `register/page.tsx` — integrate Phase 3 (do not duplicate; only add if absent).
- `(dashboard)/tournaments/page.tsx` — list: status chips, pool/participant counts (Server Component, fetches via service).
- `(dashboard)/tournaments/new/page.tsx` — creation form shell (Server Component) wrapping `<CreateTournamentForm>`.
- `tournaments/[id]/page.tsx` — public detail (Server Component) composing header, prize pool, join/QR, participants, live feed, referee panel, finished state.
- `(dashboard)/tournaments/[id]/settle/page.tsx` — referee-only settlement console shell wrapping `<SettlementConsole>`.
- `(dashboard)/admin/page.tsx` — admin user management + overview (Server Component, ADMIN-gated).

### Components (`apps/web/src/components/`)
- `tournament/CreateTournamentForm.tsx` — `"use client"`: form (name, gameTitle, entryFee + asset selector, referee address, split inputs → bps, cover upload) → `POST /api/tournaments` → `signAndSubmit(..., "deploy", ...)`.
- `tournament/WalletButton.tsx` — `"use client"`: Connect Wallet, shows truncated `G…` chip; calls `ensureWallet`.
- `tournament/JoinCard.tsx` — `"use client"`: SEP-7 QR + copyable contract address + Join button → `POST .../join` → `signAndSubmit(..., "join", ...)`.
- `tournament/QrTile.tsx` — `"use client"`: white-padded tile rendering the SEP-7 URI via `qrcode.react`.
- `tournament/PrizePoolCounter.tsx` — `"use client"`: big acid number, polling fallback fetch of `GET /api/tournaments/[id]`; Phase 5 swaps source to SSE.
- `tournament/ParticipantList.tsx` — Server-rendered list of `data-mono` addresses + join timestamps.
- `tournament/LiveFeed.tsx` — `"use client"`: ticker placeholder, polling fallback fetch of `GET /api/tournaments/[id]`; Phase 5 wires SSE.
- `tournament/RefereePanel.tsx` — `"use client"`: visible only when connected wallet === `refereeAddr`; links to `/settle`.
- `tournament/StatusChip.tsx` — Server-rendered chip: active = acid, finished = muted, cancelled = error tint.
- `tournament/ContractAddress.tsx` — `"use client"`: copyable `data-mono` `C…` chip.
- `tournament/WinnersPanel.tsx` — Server-rendered finished-state winners + explorer links.
- `tournament/CancelButton.tsx` — `"use client"`: organiser cancel → `POST .../cancel` → `signAndSubmit(..., "cancel", ...)`.
- `settlement/SettlementConsole.tsx` — `"use client"`: drag-and-drop assign 1st/2nd/3rd → `POST .../finalize` → `signAndSubmit(..., "finalize", ...)`.
- `settlement/CandidateCard.tsx` — `"use client"`: draggable participant card (grayscale → color, grab cursor).
- `settlement/PodiumSlot.tsx` — `"use client"`: drop zone for a rank (`drop-zone-active` highlight on hover).
- `settlement/SettlementModal.tsx` — `"use client"`: full-screen blurred overlay, spinning acid ring, "SIGNING…" status.
- `ui/SubmitStateModal.tsx` — `"use client"`: shared signing/submitting progress modal for create/join/cancel flows.

---

## Task 1: Tournament Zod schemas

**Files:**
- Create: `apps/web/src/lib/validation/tournament.ts`
- Test: `apps/web/src/lib/validation/tournament.test.ts`

**Interfaces:** Consumes: Phase 2 validators (`stellarPublicKey`, `stellarContractId`, `i128Amount`) from `@/lib/stellar`; Phase 0 `Asset`/`TournamentStatus` enums from generated Prisma client. / Produces: `createTournamentSchema`, `submitSchema`, `joinSchema`, `finalizeSchema`, `listQuerySchema`, `uploadSchema` + inferred types, shared client+server.

- [ ] **Step 1: Write failing schema test.**
```ts
// apps/web/src/lib/validation/tournament.test.ts
import { describe, it, expect } from "vitest";
import {
  createTournamentSchema,
  finalizeSchema,
  listQuerySchema,
} from "./tournament";

const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const G2 = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";

describe("createTournamentSchema", () => {
  it("rejects bps that do not sum to 10000", () => {
    const r = createTournamentSchema.safeParse({
      name: "Cup", gameTitle: "SF6", entryFee: "1000",
      asset: "XLM", refereeAddress: G, organizerAddress: G2,
      distributionBps: [6000, 3000, 500],
    });
    expect(r.success).toBe(false);
  });
  it("rejects organizer == referee", () => {
    const r = createTournamentSchema.safeParse({
      name: "Cup", gameTitle: "SF6", entryFee: "1000",
      asset: "XLM", refereeAddress: G, organizerAddress: G,
      distributionBps: [6000, 3000, 1000],
    });
    expect(r.success).toBe(false);
  });
  it("accepts a valid payload", () => {
    const r = createTournamentSchema.safeParse({
      name: "Cup", gameTitle: "SF6", entryFee: "1000",
      asset: "XLM", refereeAddress: G, organizerAddress: G2,
      distributionBps: [6000, 3000, 1000],
    });
    expect(r.success).toBe(true);
  });
});

describe("finalizeSchema", () => {
  it("rejects non-distinct winners", () => {
    expect(finalizeSchema.safeParse({ first: G, second: G, third: G2 }).success).toBe(false);
  });
});

describe("listQuerySchema", () => {
  it("defaults take to 20 and coerces", () => {
    const r = listQuerySchema.parse({});
    expect(r.take).toBe(20);
  });
});
```
Run: `pnpm --filter web vitest run src/lib/validation/tournament.test.ts` → expect FAIL (module not found).

- [ ] **Step 2: Implement the schemas.**
```ts
// apps/web/src/lib/validation/tournament.ts
import { z } from "zod";
import { stellarPublicKey, stellarContractId, i128Amount } from "@/lib/stellar";

export const assetSchema = z.enum(["XLM", "USDC"]);
export const statusSchema = z.enum(["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"]);

export const createTournamentSchema = z
  .object({
    name: z.string().min(1).max(120),
    gameTitle: z.string().min(1).max(120),
    entryFee: i128Amount, // string → positive BigInt
    asset: assetSchema,
    refereeAddress: stellarPublicKey,
    organizerAddress: stellarPublicKey,
    distributionBps: z.tuple([
      z.number().int().min(0).max(10000),
      z.number().int().min(0).max(10000),
      z.number().int().min(0).max(10000),
    ]),
    coverImageKey: z.string().max(256).optional(),
  })
  .refine((v) => v.distributionBps[0] + v.distributionBps[1] + v.distributionBps[2] === 10000, {
    message: "Split must sum to 10000 basis points",
    path: ["distributionBps"],
  })
  .refine((v) => v.organizerAddress !== v.refereeAddress, {
    message: "Organizer and referee must differ",
    path: ["refereeAddress"],
  });
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export const submitSchema = z.object({
  signedXdr: z.string().min(1),
  intent: z.enum(["deploy", "join", "finalize", "cancel"]),
});
export type SubmitInput = z.infer<typeof submitSchema>;

export const joinSchema = z.object({ playerAddress: stellarPublicKey });

export const finalizeSchema = z
  .object({ first: stellarPublicKey, second: stellarPublicKey, third: stellarPublicKey })
  .refine((v) => new Set([v.first, v.second, v.third]).size === 3, {
    message: "Winners must be distinct",
  });
export type FinalizeInput = z.infer<typeof finalizeSchema>;

export const listQuerySchema = z.object({
  status: statusSchema.optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const uploadSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentLength: z.coerce.number().int().min(1).max(5 * 1024 * 1024), // 5 MB cap
});
```
Run the test → expect PASS. Commit: `git commit -am "Phase 4: tournament Zod schemas"`.

---

## Task 2: POST /api/tournaments (create DRAFT + build deploy XDR)

**Files:**
- Create: `apps/web/src/server/services/tournaments.ts` (add `createTournament`)
- Create: `apps/web/src/app/api/tournaments/route.ts` (POST)
- Test: `apps/web/src/app/api/tournaments/route.test.ts`

**Interfaces:** Consumes: Phase 2 `buildDeployInitializeTx`, `resolveSacAddress` from `@/lib/stellar`; Phase 3 `requireUser`, `assertSameOrigin`, `rateLimit`; Phase 0 `prisma`, `ok`/`err`. / Produces: `POST /api/tournaments` → `{ ok, data: { tournamentId, unsignedXdr, network } }`; `createTournament(input, userId)`.

- [ ] **Step 1: Write failing integration test (mock the stellar layer).**
```ts
// apps/web/src/app/api/tournaments/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stellar", async (orig) => {
  const actual = await orig<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    buildDeployInitializeTx: vi.fn(async () => "UNSIGNED_XDR"),
    resolveSacAddress: vi.fn(() => "CSAC...NATIVE"),
  };
});
vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })),
}));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/db", () => ({
  prisma: { tournament: { create: vi.fn(async ({ data }: any) => ({ id: "t_1", ...data })) } },
}));

import { POST } from "./route";

const body = {
  name: "Cup", gameTitle: "SF6", entryFee: "10000000",
  asset: "XLM",
  refereeAddress: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
  organizerAddress: "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB",
  distributionBps: [6000, 3000, 1000],
};
const req = (b: unknown) =>
  new Request("http://localhost/api/tournaments", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(b),
  });

describe("POST /api/tournaments", () => {
  beforeEach(() => vi.clearAllMocks());
  it("creates DRAFT and returns unsigned XDR", async () => {
    const res = await POST(req(body));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.tournamentId).toBe("t_1");
    expect(json.data.unsignedXdr).toBe("UNSIGNED_XDR");
  });
  it("rejects bad split with 400", async () => {
    const res = await POST(req({ ...body, distributionBps: [6000, 3000, 500] }));
    expect(res.status).toBe(400);
  });
});
```
Run: `pnpm --filter web vitest run src/app/api/tournaments/route.test.ts` → FAIL.

- [ ] **Step 2: Implement `createTournament` in the service.**
```ts
// apps/web/src/server/services/tournaments.ts
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildDeployInitializeTx, resolveSacAddress } from "@/lib/stellar";
import type { CreateTournamentInput } from "@/lib/validation/tournament";

export async function createTournament(input: CreateTournamentInput, userId: string) {
  const tokenAddr = resolveSacAddress(input.asset);
  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      gameTitle: input.gameTitle,
      asset: input.asset,
      entryFee: BigInt(input.entryFee),
      firstBps: input.distributionBps[0],
      secondBps: input.distributionBps[1],
      thirdBps: input.distributionBps[2],
      organizerId: userId,
      organizerAddr: input.organizerAddress,
      refereeAddr: input.refereeAddress,
      tokenAddr,
      coverImageKey: input.coverImageKey ?? null,
      status: "DRAFT",
    },
  });
  const unsignedXdr = await buildDeployInitializeTx({
    organizer: input.organizerAddress,
    referee: input.refereeAddress,
    token: tokenAddr,
    entryFee: BigInt(input.entryFee),
    distributionBps: input.distributionBps,
  });
  return { tournamentId: tournament.id, unsignedXdr, network: env.STELLAR_NETWORK };
}
```

- [ ] **Step 3: Implement the thin POST handler.**
```ts
// apps/web/src/app/api/tournaments/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { createTournamentSchema } from "@/lib/validation/tournament";
import { createTournament } from "@/server/services/tournaments";

export async function POST(req: NextRequest) {
  assertSameOrigin(req);
  const user = await requireUser("ORGANIZER");
  if (!(await rateLimit(`create:${user.id}`, 10, 60))) return err("Rate limit exceeded", 429);
  const parsed = createTournamentSchema.safeParse(await req.json());
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const data = await createTournament(parsed.data, user.id);
  return ok(data, 201);
}
```
Run the test → PASS. Commit: `git commit -am "Phase 4: POST /api/tournaments create + deploy XDR"`.

---

## Task 3: POST /api/tournaments/[id]/submit (idempotent submit)

**Files:**
- Create: `apps/web/src/server/services/idempotency.ts`
- Modify: `apps/web/src/server/services/tournaments.ts` (add `submitTournamentTx`)
- Create: `apps/web/src/app/api/tournaments/[id]/submit/route.ts`
- Test: `apps/web/src/app/api/tournaments/[id]/submit/route.test.ts`

**Interfaces:** Consumes: Phase 2 `submitSignedXdr(signedXdr, intent)`, `explorerTxUrl`; Phase 3 `requireUser`, `assertSameOrigin`, `rateLimit`; Phase 0 `prisma`, `ok`/`err`, Redis via `idempotency`. / Produces: `POST /api/tournaments/[id]/submit` → `{ ok, data: { txHash, contractId?, status } }`; `submitTournamentTx`, `withIdempotency`.

- [ ] **Step 1: Write failing test for idempotency + deploy persistence.**
```ts
// apps/web/src/app/api/tournaments/[id]/submit/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const submitMock = vi.fn(async () => ({ txHash: "TX1", contractId: "CDEPLOYED...", successful: true }));
vi.mock("@/lib/stellar", async (o) => ({ ...(await o<any>()), submitSignedXdr: submitMock, explorerTxUrl: () => "https://stellar.expert/tx/TX1" }));
vi.mock("@/lib/auth-guards", () => ({ requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })) }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
const store = new Map<string, string>();
vi.mock("@/server/services/idempotency", () => ({
  withIdempotency: vi.fn(async (key: string, fn: () => Promise<any>) => {
    if (store.has(key)) return JSON.parse(store.get(key)!);
    const r = await fn();
    store.set(key, JSON.stringify(r));
    return r;
  }),
}));
const tournament = { id: "t_1", organizerId: "user_1", status: "DRAFT" };
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => tournament),
      update: vi.fn(async ({ data }: any) => ({ ...tournament, ...data })),
    },
  },
}));

import { POST } from "./route";

const req = (idem: string) =>
  new Request("http://localhost/api/tournaments/t_1/submit", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", "idempotency-key": idem },
    body: JSON.stringify({ signedXdr: "SIGNED", intent: "deploy" }),
  });
const ctx = { params: Promise.resolve({ id: "t_1" }) };

describe("POST /submit", () => {
  beforeEach(() => { store.clear(); submitMock.mockClear(); });
  it("submits deploy and persists contractId + ACTIVE", async () => {
    const res = await POST(req("k1"), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.contractId).toBe("CDEPLOYED...");
    expect(json.data.status).toBe("ACTIVE");
  });
  it("dedupes repeated idempotency key", async () => {
    await POST(req("k2"), ctx);
    await POST(req("k2"), ctx);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
  it("rejects missing idempotency key with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/tournaments/t_1/submit", {
        method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ signedXdr: "SIGNED", intent: "deploy" }),
      }), ctx);
    expect(res.status).toBe(400);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `withIdempotency`.**
```ts
// apps/web/src/server/services/idempotency.ts
import { redis } from "@/lib/redis";

export async function withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cacheKey = `idem:${key}`;
  const existing = await redis.get(cacheKey);
  if (existing) return JSON.parse(existing) as T;
  const result = await fn();
  // 24h retention; first writer wins
  await redis.set(cacheKey, JSON.stringify(result), "EX", 86400, "NX");
  return result;
}
```

- [ ] **Step 3: Implement `submitTournamentTx`.**
```ts
// apps/web/src/server/services/tournaments.ts  (append)
import { submitSignedXdr } from "@/lib/stellar";
import type { SubmitInput } from "@/lib/validation/tournament";

export async function submitTournamentTx(id: string, input: SubmitInput, userId: string) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw Object.assign(new Error("Tournament not found"), { status: 404 });
  // deploy/cancel are organiser-only; finalize is referee-gated at build time; join is public
  if ((input.intent === "deploy" || input.intent === "cancel") && t.organizerId !== userId)
    throw Object.assign(new Error("Forbidden"), { status: 403 });

  const result = await submitSignedXdr(input.signedXdr, input.intent);
  if (!result.successful) throw Object.assign(new Error("Transaction failed on-chain"), { status: 502 });

  if (input.intent === "deploy") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: { contractId: result.contractId, status: "ACTIVE", deployTxHash: result.txHash },
    });
    return { txHash: result.txHash, contractId: updated.contractId, status: updated.status };
  }
  if (input.intent === "cancel") {
    const updated = await prisma.tournament.update({
      where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return { txHash: result.txHash, status: updated.status };
  }
  if (input.intent === "finalize") {
    const updated = await prisma.tournament.update({
      where: { id }, data: { status: "FINISHED", finalizedAt: new Date() },
    });
    return { txHash: result.txHash, status: updated.status };
  }
  // join: subscriber (Phase 5) records the Participant from the confirmed event
  return { txHash: result.txHash, status: t.status };
}
```

- [ ] **Step 4: Implement the handler.**
```ts
// apps/web/src/app/api/tournaments/[id]/submit/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { submitSchema } from "@/lib/validation/tournament";
import { submitTournamentTx } from "@/server/services/tournaments";
import { withIdempotency } from "@/server/services/idempotency";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const idem = req.headers.get("idempotency-key");
  if (!idem) return err("Idempotency-Key header required", 400);
  if (!(await rateLimit(`submit:${user.id}`, 20, 60))) return err("Rate limit exceeded", 429);
  const parsed = submitSchema.safeParse(await req.json());
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  try {
    const data = await withIdempotency(`${id}:${idem}`, () =>
      submitTournamentTx(id, parsed.data, user.id),
    );
    return ok(data);
  } catch (e: any) {
    return err(e.message ?? "Submit failed", e.status ?? 500);
  }
}
```
Run → PASS. Commit: `git commit -am "Phase 4: POST /submit idempotent on-chain submission"`.

---

## Task 4: GET /api/tournaments (owner-scoped list) + GET /api/tournaments/[id] (public detail)

**Files:**
- Modify: `apps/web/src/server/services/tournaments.ts` (add `listTournaments`, `getTournamentDetail`)
- Modify: `apps/web/src/app/api/tournaments/route.ts` (add GET)
- Create: `apps/web/src/app/api/tournaments/[id]/route.ts` (GET)
- Test: `apps/web/src/app/api/tournaments/list.test.ts`, `apps/web/src/app/api/tournaments/[id]/route.test.ts`

**Interfaces:** Consumes: Phase 3 `requireUser`; Phase 0 `prisma`, `ok`/`err`; Phase 2 `explorerContractUrl`, `explorerTxUrl`. / Produces: `GET /api/tournaments` → `{ ok, data: { items, nextCursor } }` (owner-scoped); `GET /api/tournaments/[id]` → public detail with pool, participants, status, winners.

- [ ] **Step 1: Write failing list test (owner-scoped + status filter).**
```ts
// apps/web/src/app/api/tournaments/list.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findMany = vi.fn();
vi.mock("@/lib/auth-guards", () => ({ requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })) }));
vi.mock("@/lib/db", () => ({ prisma: { tournament: { findMany } } }));
import { GET } from "./route";

describe("GET /api/tournaments", () => {
  beforeEach(() => findMany.mockReset());
  it("scopes to the owner and applies status filter", async () => {
    findMany.mockResolvedValue([
      { id: "t_1", name: "Cup", status: "ACTIVE", entryFee: 10n, asset: "XLM",
        _count: { participants: 3 } },
    ]);
    const res = await GET(new Request("http://localhost/api/tournaments?status=ACTIVE&take=20"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ organizerId: "user_1", status: "ACTIVE" });
    expect(json.data.items[0].entryFee).toBe("10"); // BigInt serialized to string
    expect(json.data.items[0].participantCount).toBe(3);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Write failing detail test (public).**
```ts
// apps/web/src/app/api/tournaments/[id]/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/stellar", async (o) => ({ ...(await o<any>()),
  explorerContractUrl: () => "https://stellar.expert/c/C1",
  explorerTxUrl: (h: string) => `https://stellar.expert/tx/${h}` }));
vi.mock("@/lib/db", () => ({
  prisma: { tournament: { findUnique: vi.fn(async () => ({
    id: "t_1", name: "Cup", gameTitle: "SF6", status: "FINISHED", asset: "XLM",
    entryFee: 10000000n, firstBps: 6000, secondBps: 3000, thirdBps: 1000,
    contractId: "C1", organizerAddr: "G_ORG", refereeAddr: "G_REF",
    participants: [{ playerAddr: "G_P1", joinedAt: new Date(), joinTxHash: "JT1" }],
    payouts: [{ rank: 1, playerAddr: "G_P1", amount: 6000000n, txHash: "PT1" }],
  })) } },
}));
import { GET } from "./route";

describe("GET /api/tournaments/[id]", () => {
  it("returns public detail with pool + winners + explorer links", async () => {
    const res = await GET(new Request("http://localhost/api/tournaments/t_1"),
      { params: Promise.resolve({ id: "t_1" }) });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.pool).toBe("10000000"); // 1 participant * entryFee
    expect(json.data.contractUrl).toContain("stellar.expert");
    expect(json.data.winners[0].explorerUrl).toContain("PT1");
  });
  it("404s unknown id", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as any).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost/api/tournaments/x"),
      { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });
});
```
Run → FAIL.

- [ ] **Step 3: Implement `listTournaments` + `getTournamentDetail`.**
```ts
// apps/web/src/server/services/tournaments.ts  (append)
import { explorerContractUrl, explorerTxUrl } from "@/lib/stellar";
import type { z } from "zod";
import { listQuerySchema } from "@/lib/validation/tournament";

export async function listTournaments(userId: string, q: z.infer<typeof listQuerySchema>) {
  const rows = await prisma.tournament.findMany({
    where: { organizerId: userId, ...(q.status ? { status: q.status } : {}) },
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, q.take).map((t) => ({
    id: t.id, name: t.name, gameTitle: t.gameTitle, status: t.status, asset: t.asset,
    entryFee: t.entryFee.toString(),
    pool: (t.entryFee * BigInt(t._count.participants)).toString(),
    participantCount: t._count.participants,
  }));
  const nextCursor = rows.length > q.take ? rows[q.take]!.id : null;
  return { items, nextCursor };
}

export async function getTournamentDetail(id: string) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { participants: { orderBy: { joinedAt: "asc" } }, payouts: { orderBy: { rank: "asc" } } },
  });
  if (!t) return null;
  const pool = (t.entryFee * BigInt(t.participants.length)).toString();
  return {
    id: t.id, name: t.name, gameTitle: t.gameTitle, status: t.status, asset: t.asset,
    entryFee: t.entryFee.toString(),
    distributionBps: [t.firstBps, t.secondBps, t.thirdBps] as const,
    contractId: t.contractId,
    contractUrl: t.contractId ? explorerContractUrl(t.contractId) : null,
    tokenAddr: t.tokenAddr, organizerAddr: t.organizerAddr, refereeAddr: t.refereeAddr,
    pool,
    participants: t.participants.map((p) => ({
      playerAddr: p.playerAddr, joinedAt: p.joinedAt.toISOString(), joinTxHash: p.joinTxHash,
    })),
    winners: t.payouts.map((p) => ({
      rank: p.rank, playerAddr: p.playerAddr, amount: p.amount.toString(),
      txHash: p.txHash, explorerUrl: p.txHash ? explorerTxUrl(p.txHash) : null,
    })),
  };
}
```

- [ ] **Step 4: Implement GET handlers.**
```ts
// apps/web/src/app/api/tournaments/route.ts  (append GET)
import { listQuerySchema } from "@/lib/validation/tournament";
import { listTournaments } from "@/server/services/tournaments";

export async function GET(req: NextRequest) {
  const user = await requireUser("ORGANIZER");
  const q = listQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return err(q.error.issues[0]?.message ?? "Invalid query", 400);
  return ok(await listTournaments(user.id, q.data));
}
```
```ts
// apps/web/src/app/api/tournaments/[id]/route.ts
import { ok, err } from "@/lib/api";
import { getTournamentDetail } from "@/server/services/tournaments";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const data = await getTournamentDetail(id);
  if (!data) return err("Tournament not found", 404);
  return ok(data);
}
```
Run both tests → PASS. Commit: `git commit -am "Phase 4: list (owner-scoped) + public detail endpoints"`.

---

## Task 5: POST /api/tournaments/[id]/join (build join XDR)

**Files:**
- Modify: `apps/web/src/server/services/tournaments.ts` (add `buildJoin`)
- Create: `apps/web/src/app/api/tournaments/[id]/join/route.ts`
- Test: `apps/web/src/app/api/tournaments/[id]/join/route.test.ts`

**Interfaces:** Consumes: Phase 2 `buildJoinTx`; Phase 3 `assertSameOrigin`, `rateLimit`; Phase 0 `prisma`, `ok`/`err`. / Produces: `POST /api/tournaments/[id]/join` → `{ ok, data: { unsignedXdr, network } }`; `buildJoin(id, playerAddress)`.

- [ ] **Step 1: Write failing test.**
```ts
// apps/web/src/app/api/tournaments/[id]/join/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/stellar", async (o) => ({ ...(await o<any>()), buildJoinTx: vi.fn(async () => "JOIN_XDR") }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/db", () => ({ prisma: { tournament: { findUnique: vi.fn(async () => ({
  id: "t_1", status: "ACTIVE", contractId: "C1", entryFee: 10n, tokenAddr: "CSAC" })) } } }));
import { POST } from "./route";
const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const ctx = { params: Promise.resolve({ id: "t_1" }) };
const mk = (b: unknown) => new Request("http://localhost/api/tournaments/t_1/join", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(b) });

describe("POST /join", () => {
  it("builds a join XDR for a valid player", async () => {
    const res = await POST(mk({ playerAddress: G }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("JOIN_XDR");
  });
  it("rejects join when not ACTIVE", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as any).mockResolvedValueOnce({ id: "t_1", status: "DRAFT", contractId: null });
    const res = await POST(mk({ playerAddress: G }), ctx);
    expect(res.status).toBe(409);
  });
  it("400s an invalid address", async () => {
    const res = await POST(mk({ playerAddress: "nope" }), ctx);
    expect(res.status).toBe(400);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `buildJoin`.**
```ts
// apps/web/src/server/services/tournaments.ts  (append)
import { buildJoinTx } from "@/lib/stellar";

export async function buildJoin(id: string, playerAddress: string) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw Object.assign(new Error("Tournament not found"), { status: 404 });
  if (t.status !== "ACTIVE" || !t.contractId)
    throw Object.assign(new Error("Tournament is not open for joining"), { status: 409 });
  const unsignedXdr = await buildJoinTx({
    contractId: t.contractId, player: playerAddress,
    token: t.tokenAddr!, entryFee: t.entryFee,
  });
  return { unsignedXdr, network: env.STELLAR_NETWORK };
}
```

- [ ] **Step 3: Implement the handler.**
```ts
// apps/web/src/app/api/tournaments/[id]/join/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { joinSchema } from "@/lib/validation/tournament";
import { buildJoin } from "@/server/services/tournaments";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!(await rateLimit(`join:${id}`, 30, 60))) return err("Rate limit exceeded", 429);
  const parsed = joinSchema.safeParse(await req.json());
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  try {
    return ok(await buildJoin(id, parsed.data.playerAddress));
  } catch (e: any) {
    return err(e.message ?? "Join failed", e.status ?? 500);
  }
}
```
Run → PASS. Commit: `git commit -am "Phase 4: POST /join build join XDR"`.

---

## Task 6: POST /api/tournaments/[id]/finalize (referee-gated, validate distinct + registered)

**Files:**
- Modify: `apps/web/src/server/services/tournaments.ts` (add `buildFinalize`)
- Create: `apps/web/src/app/api/tournaments/[id]/finalize/route.ts`
- Test: `apps/web/src/app/api/tournaments/[id]/finalize/route.test.ts`

**Interfaces:** Consumes: Phase 2 `buildFinalizeTx`; Phase 3 `getCurrentUser`, `assertSameOrigin`, `rateLimit`; Phase 0 `prisma`, `ok`/`err`. The referee identity is the **connected wallet** posting the build request — gated by matching `refereeAddr`; the request carries the wallet via header `x-wallet-address` (verified again at submit by contract `require_auth`). / Produces: `POST /api/tournaments/[id]/finalize` → `{ ok, data: { unsignedXdr, network } }`; `buildFinalize(id, input, walletAddress)`.

- [ ] **Step 1: Write failing test (referee gate + registration check).**
```ts
// apps/web/src/app/api/tournaments/[id]/finalize/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/stellar", async (o) => ({ ...(await o<any>()), buildFinalizeTx: vi.fn(async () => "FIN_XDR") }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
const G = (s: string) => "G" + s.padEnd(55, "A");
const REF = G("REF"); const A = G("AAA"); const B = G("BBB"); const C = G("CCC"); const X = G("XXX");
vi.mock("@/lib/db", () => ({ prisma: { tournament: { findUnique: vi.fn(async () => ({
  id: "t_1", status: "ACTIVE", contractId: "C1", refereeAddr: REF,
  participants: [{ playerAddr: A }, { playerAddr: B }, { playerAddr: C }] })) } } }));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ id: "t_1" }) };
const mk = (b: unknown, wallet: string) => new Request("http://localhost/api/tournaments/t_1/finalize", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", "x-wallet-address": wallet },
  body: JSON.stringify(b) });

describe("POST /finalize", () => {
  it("builds finalize XDR for the referee with registered, distinct winners", async () => {
    const res = await POST(mk({ first: A, second: B, third: C }, REF), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("FIN_XDR");
  });
  it("403s a non-referee wallet", async () => {
    const res = await POST(mk({ first: A, second: B, third: C }, X), ctx);
    expect(res.status).toBe(403);
  });
  it("422s when a winner is not registered", async () => {
    const res = await POST(mk({ first: A, second: B, third: X }, REF), ctx);
    expect(res.status).toBe(422);
  });
  it("400s non-distinct winners", async () => {
    const res = await POST(mk({ first: A, second: A, third: B }, REF), ctx);
    expect(res.status).toBe(400);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `buildFinalize`.**
```ts
// apps/web/src/server/services/tournaments.ts  (append)
import { buildFinalizeTx } from "@/lib/stellar";
import type { FinalizeInput } from "@/lib/validation/tournament";

export async function buildFinalize(id: string, input: FinalizeInput, walletAddress: string) {
  const t = await prisma.tournament.findUnique({
    where: { id }, include: { participants: true },
  });
  if (!t) throw Object.assign(new Error("Tournament not found"), { status: 404 });
  if (t.refereeAddr !== walletAddress)
    throw Object.assign(new Error("Only the referee can finalize"), { status: 403 });
  if (t.status !== "ACTIVE" || !t.contractId)
    throw Object.assign(new Error("Tournament is not finalizable"), { status: 409 });
  const registered = new Set(t.participants.map((p) => p.playerAddr));
  for (const addr of [input.first, input.second, input.third]) {
    if (!registered.has(addr))
      throw Object.assign(new Error(`Winner ${addr} is not registered`), { status: 422 });
  }
  const unsignedXdr = await buildFinalizeTx({
    contractId: t.contractId, referee: t.refereeAddr,
    first: input.first, second: input.second, third: input.third,
  });
  return { unsignedXdr, network: env.STELLAR_NETWORK };
}
```

- [ ] **Step 3: Implement the handler.**
```ts
// apps/web/src/app/api/tournaments/[id]/finalize/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { finalizeSchema } from "@/lib/validation/tournament";
import { stellarPublicKey } from "@/lib/stellar";
import { buildFinalize } from "@/server/services/tournaments";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!(await rateLimit(`finalize:${id}`, 10, 60))) return err("Rate limit exceeded", 429);
  const wallet = stellarPublicKey.safeParse(req.headers.get("x-wallet-address"));
  if (!wallet.success) return err("Connected wallet required", 400);
  const parsed = finalizeSchema.safeParse(await req.json());
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  try {
    return ok(await buildFinalize(id, parsed.data, wallet.data));
  } catch (e: any) {
    return err(e.message ?? "Finalize failed", e.status ?? 500);
  }
}
```
Run → PASS. Commit: `git commit -am "Phase 4: POST /finalize referee-gated build"`.

---

## Task 7: POST /api/tournaments/[id]/cancel (organiser-only, pre-finalisation)

**Files:**
- Modify: `apps/web/src/server/services/tournaments.ts` (add `buildCancel`)
- Create: `apps/web/src/app/api/tournaments/[id]/cancel/route.ts`
- Test: `apps/web/src/app/api/tournaments/[id]/cancel/route.test.ts`

**Interfaces:** Consumes: Phase 2 `buildCancelTx`; Phase 3 `requireUser`, `assertSameOrigin`, `rateLimit`; Phase 0 `prisma`, `ok`/`err`. / Produces: `POST /api/tournaments/[id]/cancel` → `{ ok, data: { unsignedXdr, network } }`; `buildCancel(id, userId)`.

- [ ] **Step 1: Write failing test (owner gate + state guard).**
```ts
// apps/web/src/app/api/tournaments/[id]/cancel/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/stellar", async (o) => ({ ...(await o<any>()), buildCancelTx: vi.fn(async () => "CANCEL_XDR") }));
vi.mock("@/lib/auth-guards", () => ({ requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })) }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/db", () => ({ prisma: { tournament: { findUnique: vi.fn(async () => ({
  id: "t_1", organizerId: "user_1", organizerAddr: "G_ORG", status: "ACTIVE", contractId: "C1" })) } } }));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ id: "t_1" }) };
const mk = () => new Request("http://localhost/api/tournaments/t_1/cancel", {
  method: "POST", headers: { origin: "http://localhost" } });

describe("POST /cancel", () => {
  it("builds cancel XDR for the owner pre-finalisation", async () => {
    const res = await POST(mk(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("CANCEL_XDR");
  });
  it("403s a non-owner", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as any).mockResolvedValueOnce({ id: "t_1", organizerId: "other", status: "ACTIVE", contractId: "C1" });
    expect((await POST(mk(), ctx)).status).toBe(403);
  });
  it("409s a finished tournament", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as any).mockResolvedValueOnce({ id: "t_1", organizerId: "user_1", status: "FINISHED", contractId: "C1" });
    expect((await POST(mk(), ctx)).status).toBe(409);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `buildCancel`.**
```ts
// apps/web/src/server/services/tournaments.ts  (append)
import { buildCancelTx } from "@/lib/stellar";

export async function buildCancel(id: string, userId: string) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw Object.assign(new Error("Tournament not found"), { status: 404 });
  if (t.organizerId !== userId)
    throw Object.assign(new Error("Only the organiser can cancel"), { status: 403 });
  if (t.status !== "ACTIVE" || !t.contractId)
    throw Object.assign(new Error("Only an active tournament can be cancelled"), { status: 409 });
  const unsignedXdr = await buildCancelTx({ contractId: t.contractId, organizer: t.organizerAddr });
  return { unsignedXdr, network: env.STELLAR_NETWORK };
}
```

- [ ] **Step 3: Implement the handler.**
```ts
// apps/web/src/app/api/tournaments/[id]/cancel/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { buildCancel } from "@/server/services/tournaments";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  assertSameOrigin(req);
  const user = await requireUser("ORGANIZER");
  const { id } = await ctx.params;
  if (!(await rateLimit(`cancel:${user.id}`, 10, 60))) return err("Rate limit exceeded", 429);
  try {
    return ok(await buildCancel(id, user.id));
  } catch (e: any) {
    return err(e.message ?? "Cancel failed", e.status ?? 500);
  }
}
```
Run → PASS. Commit: `git commit -am "Phase 4: POST /cancel organiser-gated build"`.

---

## Task 8: POST /api/uploads (presigned S3 PUT)

**Files:**
- Create: `apps/web/src/server/services/uploads.ts`
- Create: `apps/web/src/lib/s3.ts` (S3 client singleton)
- Create: `apps/web/src/app/api/uploads/route.ts`
- Test: `apps/web/src/server/services/uploads.test.ts`, `apps/web/src/app/api/uploads/route.test.ts`

**Interfaces:** Consumes: Phase 0 `env` (S3 vars), `ok`/`err`; Phase 3 `requireUser`, `assertSameOrigin`, `rateLimit`. / Produces: `POST /api/uploads` → `{ ok, data: { uploadUrl, key } }`; `createPresignedUpload(contentType, contentLength)`.

- [ ] **Step 1: Write failing service test (validation + random key, never trust filename).**
```ts
// apps/web/src/server/services/uploads.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://minio/presigned") }));
vi.mock("@/lib/s3", () => ({ s3: {}, BUCKET: "ggg-uploads" }));
import { createPresignedUpload } from "./uploads";

describe("createPresignedUpload", () => {
  it("returns a random key with the correct extension and a presigned URL", async () => {
    const r = await createPresignedUpload("image/png", 1000);
    expect(r.uploadUrl).toBe("https://minio/presigned");
    expect(r.key).toMatch(/^covers\/[a-f0-9-]+\.png$/);
  });
  it("rejects oversize uploads", async () => {
    await expect(createPresignedUpload("image/png", 6 * 1024 * 1024)).rejects.toThrow();
  });
  it("rejects disallowed MIME", async () => {
    await expect(createPresignedUpload("application/zip" as any, 100)).rejects.toThrow();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement the S3 singleton.**
```ts
// apps/web/src/lib/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export const BUCKET = env.S3_BUCKET;
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
```

- [ ] **Step 3: Implement `createPresignedUpload`.**
```ts
// apps/web/src/server/services/uploads.ts
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET } from "@/lib/s3";

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function createPresignedUpload(contentType: string, contentLength: number) {
  const ext = EXT[contentType];
  if (!ext) throw Object.assign(new Error("Unsupported content type"), { status: 400 });
  if (contentLength <= 0 || contentLength > MAX_BYTES)
    throw Object.assign(new Error("File too large"), { status: 400 });
  // server-generated key: never trust client filename
  const key = `covers/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: 300 },
  );
  return { uploadUrl, key };
}
```

- [ ] **Step 4: Write + pass the handler test, then implement the handler.**
```ts
// apps/web/src/app/api/uploads/route.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth-guards", () => ({ requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })) }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }));
vi.mock("@/server/services/uploads", () => ({ createPresignedUpload: vi.fn(async () => ({ uploadUrl: "U", key: "covers/x.png" })) }));
import { POST } from "./route";
const mk = (b: unknown) => new Request("http://localhost/api/uploads", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(b) });

describe("POST /api/uploads", () => {
  it("returns presigned url + key", async () => {
    const res = await POST(mk({ contentType: "image/png", contentLength: 1000 }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.key).toBe("covers/x.png");
  });
  it("400s invalid body", async () => {
    expect((await POST(mk({ contentType: "x", contentLength: -1 }))).status).toBe(400);
  });
});
```
```ts
// apps/web/src/app/api/uploads/route.ts
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { uploadSchema } from "@/lib/validation/tournament";
import { createPresignedUpload } from "@/server/services/uploads";

export async function POST(req: NextRequest) {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!(await rateLimit(`upload:${user.id}`, 20, 60))) return err("Rate limit exceeded", 429);
  const parsed = uploadSchema.safeParse(await req.json());
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  try {
    return ok(await createPresignedUpload(parsed.data.contentType, parsed.data.contentLength));
  } catch (e: any) {
    return err(e.message ?? "Upload failed", e.status ?? 500);
  }
}
```
Run both → PASS. Commit: `git commit -am "Phase 4: POST /api/uploads presigned S3 PUT"`.

---

## Task 9: Freighter client wallet helper (`lib/wallet.ts`)

**Files:**
- Create: `apps/web/src/lib/wallet.ts`
- Test: `apps/web/src/lib/wallet.test.ts`

**Interfaces:** Consumes: `@stellar/freighter-api` (`isConnected`, `requestAccess`, `getAddress`, `getNetwork`, `signTransaction`); the `/submit` route contract. / Produces: `ensureWallet(expectedPassphrase) => Promise<string>`; `signAndSubmit(unsignedXdr, intent, submitUrl) => Promise<SubmitResult>`. Consumed by every flow component (create/join/finalize/cancel).

- [ ] **Step 1: Write failing wallet test (network guard + sign+submit + idempotency key).**
```ts
// apps/web/src/lib/wallet.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const freighter = {
  isConnected: vi.fn(async () => ({ isConnected: true })),
  requestAccess: vi.fn(async () => ({ address: "G_ME" })),
  getAddress: vi.fn(async () => ({ address: "G_ME" })),
  getNetwork: vi.fn(async () => ({ networkPassphrase: "Test SDF Network ; September 2015" })),
  signTransaction: vi.fn(async () => ({ signedTxXdr: "SIGNED" })),
};
vi.mock("@stellar/freighter-api", () => ({ default: freighter, ...freighter }));

import { ensureWallet, signAndSubmit } from "./wallet";
const PASS = "Test SDF Network ; September 2015";

describe("ensureWallet", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns address when network matches", async () => {
    expect(await ensureWallet(PASS)).toBe("G_ME");
  });
  it("throws on wrong network", async () => {
    freighter.getNetwork.mockResolvedValueOnce({ networkPassphrase: "Public Global Stellar Network ; September 2015" });
    await expect(ensureWallet(PASS)).rejects.toThrow(/network/i);
  });
  it("throws when not installed", async () => {
    freighter.isConnected.mockResolvedValueOnce({ isConnected: false });
    await expect(ensureWallet(PASS)).rejects.toThrow(/Freighter/);
  });
});

describe("signAndSubmit", () => {
  it("signs then POSTs signed XDR with an Idempotency-Key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { txHash: "TX" } }),
      { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await signAndSubmit("UNSIGNED", "deploy", "/api/tournaments/t_1/submit", PASS);
    expect(r.txHash).toBe("TX");
    const call = fetchMock.mock.calls[0];
    expect(call[1].headers["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(call[1].body)).toMatchObject({ signedXdr: "SIGNED", intent: "deploy" });
  });
  it("throws on a non-ok envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "boom" }),
      { status: 502, headers: { "content-type": "application/json" } })));
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toThrow("boom");
  });
});
```
Run: `pnpm --filter web vitest run src/lib/wallet.test.ts` → FAIL.

- [ ] **Step 2: Implement `lib/wallet.ts`.**
```ts
// apps/web/src/lib/wallet.ts
"use client";
import freighter from "@stellar/freighter-api";

export type SubmitResult = { txHash: string; contractId?: string; status?: string };

export async function ensureWallet(expectedPassphrase: string): Promise<string> {
  const connected = await freighter.isConnected();
  if (!connected.isConnected) throw new Error("Freighter is not installed or unavailable");
  await freighter.requestAccess();
  const { address } = await freighter.getAddress();
  const { networkPassphrase } = await freighter.getNetwork();
  if (networkPassphrase !== expectedPassphrase)
    throw new Error("Wrong network — switch Freighter to the tournament's network");
  return address;
}

export async function signAndSubmit(
  unsignedXdr: string,
  intent: "deploy" | "join" | "finalize" | "cancel",
  submitUrl: string,
  expectedPassphrase: string,
): Promise<SubmitResult> {
  const address = await ensureWallet(expectedPassphrase);
  const { signedTxXdr } = await freighter.signTransaction(unsignedXdr, {
    networkPassphrase: expectedPassphrase,
    address,
  });
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ signedXdr: signedTxXdr, intent }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Submission failed");
  return json.data as SubmitResult;
}
```
Run → PASS. Commit: `git commit -am "Phase 4: Freighter wallet helper (ensureWallet + signAndSubmit)"`.

---

## Task 10: Shared UI atoms — StatusChip, ContractAddress, WalletButton, SubmitStateModal

**Files:**
- Create: `apps/web/src/components/tournament/StatusChip.tsx`
- Create: `apps/web/src/components/tournament/ContractAddress.tsx`
- Create: `apps/web/src/components/tournament/WalletButton.tsx`
- Create: `apps/web/src/components/ui/SubmitStateModal.tsx`
- Test: `apps/web/src/components/tournament/StatusChip.test.tsx`, `apps/web/src/components/tournament/ContractAddress.test.tsx`, `apps/web/src/components/tournament/WalletButton.test.tsx`

**Interfaces:** Consumes: `lib/wallet.ts` `ensureWallet`; `env.NEXT_PUBLIC_NETWORK_PASSPHRASE` (exposed at build). / Produces: `<StatusChip status>`, `<ContractAddress value>`, `<WalletButton onConnected>`, `<SubmitStateModal open phase>` — reused by detail page + flows.

- [ ] **Step 1: Write failing StatusChip test (BRAND classes).**
```tsx
// apps/web/src/components/tournament/StatusChip.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders ACTIVE with acid styling and label-caps", () => {
    render(<StatusChip status="ACTIVE" />);
    const chip = screen.getByText("ACTIVE");
    expect(chip).toHaveClass("label-caps");
    expect(chip.className).toMatch(/acid-yellow/);
  });
  it("renders CANCELLED with error tint", () => {
    render(<StatusChip status="CANCELLED" />);
    expect(screen.getByText("CANCELLED").className).toMatch(/error/);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement StatusChip.**
```tsx
// apps/web/src/components/tournament/StatusChip.tsx
type Status = "DRAFT" | "ACTIVE" | "FINISHED" | "CANCELLED";
const styles: Record<Status, string> = {
  DRAFT: "border-outline-variant text-on-surface-variant",
  ACTIVE: "border-acid-yellow text-acid-yellow",
  FINISHED: "border-outline-variant text-on-surface-variant",
  CANCELLED: "border-error text-error",
};
export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`label-caps inline-flex items-center rounded-full border-2 px-3 py-1 ${styles[status]}`}
      data-status={status}
    >
      {status}
    </span>
  );
}
```
Run → PASS.

- [ ] **Step 3: Write failing ContractAddress test (copy + data-mono).**
```tsx
// apps/web/src/components/tournament/ContractAddress.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContractAddress } from "./ContractAddress";

describe("ContractAddress", () => {
  it("renders truncated data-mono value and copies full value", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ContractAddress value="CDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE" />);
    const btn = screen.getByRole("button", { name: /copy/i });
    expect(btn.className).toMatch(/data-mono/);
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalledWith("CDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE");
  });
});
```
Run → FAIL.

- [ ] **Step 4: Implement ContractAddress.**
```tsx
// apps/web/src/components/tournament/ContractAddress.tsx
"use client";
import { useState } from "react";

function truncate(v: string) {
  return v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v;
}
export function ContractAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy address ${value}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="data-mono inline-flex items-center gap-2 rounded-lg bg-surface-container px-2 py-1 text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <span aria-hidden>{truncate(value)}</span>
      <span className="material-symbols-outlined text-base" aria-hidden>
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}
```
Run → PASS.

- [ ] **Step 5: Write failing WalletButton test + implement.**
```tsx
// apps/web/src/components/tournament/WalletButton.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/wallet", () => ({ ensureWallet: vi.fn(async () => "GABCDEFGHIJABCDEFGHIJ") }));
import { WalletButton } from "./WalletButton";

describe("WalletButton", () => {
  it("connects and shows a truncated acid wallet chip", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    const btn = screen.getByRole("button", { name: /connect wallet/i });
    expect(btn).toHaveClass("label-caps");
    fireEvent.click(btn);
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith("GABCDEFGHIJABCDEFGHIJ"));
    expect(screen.getByText(/GABCDE…FGHIJ/)).toBeInTheDocument();
  });
});
```
```tsx
// apps/web/src/components/tournament/WalletButton.tsx
"use client";
import { useState } from "react";
import { ensureWallet } from "@/lib/wallet";

export function WalletButton({
  expectedPassphrase, onConnected,
}: { expectedPassphrase: string; onConnected: (address: string) => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (address) {
    return (
      <span className="data-mono inline-flex items-center gap-2 rounded-full border-2 border-acid-yellow px-3 py-1 text-acid-yellow">
        <span className="material-symbols-outlined text-base" aria-hidden>account_balance_wallet</span>
        {address.slice(0, 6)}…{address.slice(-5)}
      </span>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="label-caps rounded-lg bg-acid-yellow px-4 py-2 text-on-secondary-fixed transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
        onClick={async () => {
          setError(null);
          try { const a = await ensureWallet(expectedPassphrase); setAddress(a); onConnected(a); }
          catch (e: any) { setError(e.message); }
        }}
      >
        Connect Wallet
      </button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Implement SubmitStateModal (BRAND §6 signing overlay).**
```tsx
// apps/web/src/components/ui/SubmitStateModal.tsx
"use client";
type Phase = "idle" | "signing" | "submitting" | "success" | "error";
export function SubmitStateModal({
  open, phase, message,
}: { open: boolean; phase: Phase; message?: string }) {
  if (!open) return null;
  const label = {
    idle: "", signing: "SIGNING…", submitting: "SUBMITTING…",
    success: "SETTLED", error: message ?? "FAILED",
  }[phase];
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Transaction in progress"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
    >
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-outline-variant border-t-acid-yellow motion-reduce:animate-none" />
      <p className="label-caps mt-6 text-acid-yellow">{label}</p>
    </div>
  );
}
```
Run all atom tests → PASS. Commit: `git commit -am "Phase 4: shared UI atoms (StatusChip, ContractAddress, WalletButton, SubmitStateModal)"`.

---

## Task 11: Landing page `/`

**Files:**
- Create: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/app/page.test.tsx`

**Interfaces:** Consumes: nothing on-chain. / Produces: public landing Server Component with hero thesis + Create Tournament CTA → `/tournaments/new`.

- [ ] **Step 1: Write failing landing test (hero + CTA per BRAND voice).**
```tsx
// apps/web/src/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Page from "./page";

describe("/ landing", () => {
  it("renders the hero thesis and a Create Tournament CTA linking to /tournaments/new", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /create tournament/i });
    expect(cta).toHaveAttribute("href", "/tournaments/new");
    expect(cta.className).toMatch(/electric-violet/);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement the landing page.**
```tsx
// apps/web/src/app/page.tsx
import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-24 md:px-(--spacing-margin-desktop)">
      <p className="label-caps text-acid-yellow">Trustless · On-chain · Live</p>
      <h1 className="mt-4 max-w-3xl text-[48px] font-extrabold leading-[1.1] -tracking-[0.04em] text-on-surface">
        Prize pools the contract holds — not a custodian.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-on-surface-variant">
        Create an on-chain escrow for any game. Players join by paying a crypto entry fee, a
        referee submits the final ranking, and a Soroban contract settles the split automatically.
      </p>
      <Link
        href="/tournaments/new"
        className="brutalist-border label-caps mt-10 inline-block bg-electric-violet-strong px-8 py-4 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
      >
        Create Tournament
      </Link>
    </main>
  );
}
```
Run → PASS. Commit: `git commit -am "Phase 4: landing page"`.

---

## Task 12: Auth pages `/login` + `/register` (integrate Phase 3)

**Files:**
- Verify/Modify: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/register/page.tsx`
- Test: `apps/web/src/app/login/page.test.tsx` (only if creating)

**Interfaces:** Consumes: Phase 3 NextAuth client `signIn` / `POST /api/auth/register`. / Produces: BRAND-styled login + register forms (only created here if Phase 3 did not ship them).

- [ ] **Step 1: Check whether Phase 3 created the pages.**
Run: `ls apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx 2>/dev/null`.
- If both exist: open each, confirm they use `kinetic-glass` panel, `label-caps` field labels, violet focus ring, and the acid CTA; if compliant, mark this task done with NO new file (do not duplicate). Commit only if you edited.
- If absent: proceed to Step 2.

- [ ] **Step 2: (Only if missing) Write failing login test.**
```tsx
// apps/web/src/app/login/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Page from "./page";
describe("/login", () => {
  it("renders username + password fields with label-caps labels", () => {
    render(<Page />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 3: (Only if missing) Implement a minimal BRAND login form calling NextAuth `signIn("credentials", …)`** inside a `kinetic-glass` panel with `label-caps` labels, `data-mono` inputs, and an acid `Sign In` button (mirror `register/page.tsx` for self-registration via `POST /api/auth/register`). Run test → PASS. Commit: `git commit -am "Phase 4: auth pages (integrated/added)"`.

---

## Task 13: `/tournaments` list page

**Files:**
- Create: `apps/web/src/app/(dashboard)/tournaments/page.tsx`
- Create: `apps/web/src/components/tournament/TournamentListRow.tsx`
- Test: `apps/web/src/components/tournament/TournamentListRow.test.tsx`

**Interfaces:** Consumes: Phase 3 `requireUser`; `listTournaments` service (called directly server-side, not via fetch); `StatusChip`. / Produces: Server Component list page with status chips, pool + participant counts, empty-state CTA.

- [ ] **Step 1: Write failing row test (chip + counts + mono pool).**
```tsx
// apps/web/src/components/tournament/TournamentListRow.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TournamentListRow } from "./TournamentListRow";

describe("TournamentListRow", () => {
  it("shows name, status chip, mono pool and participant count, linking to detail", () => {
    render(<TournamentListRow t={{ id: "t_1", name: "Cup", gameTitle: "SF6",
      status: "ACTIVE", asset: "XLM", entryFee: "10000000", pool: "30000000", participantCount: 3 }} />);
    expect(screen.getByText("Cup")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const pool = screen.getByText(/3\.0000000 XLM/);
    expect(pool).toHaveClass("data-mono");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tournaments/t_1");
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement the row (stroops → display via BigInt, never float).**
```tsx
// apps/web/src/components/tournament/TournamentListRow.tsx
import Link from "next/link";
import { StatusChip } from "./StatusChip";

export type ListItem = {
  id: string; name: string; gameTitle: string;
  status: "DRAFT" | "ACTIVE" | "FINISHED" | "CANCELLED";
  asset: "XLM" | "USDC"; entryFee: string; pool: string; participantCount: number;
};
function formatAmount(stroops: string) {
  const n = BigInt(stroops);
  const whole = n / 10_000_000n;
  const frac = (n % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}
export function TournamentListRow({ t }: { t: ListItem }) {
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="glass-panel flex items-center justify-between rounded-xl p-6 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <div>
        <h3 className="text-xl font-bold text-on-surface">{t.name}</h3>
        <p className="label-caps mt-1 text-on-surface-variant">{t.gameTitle}</p>
      </div>
      <div className="flex items-center gap-6">
        <span className="data-mono text-acid-yellow">{formatAmount(t.pool)} {t.asset}</span>
        <span className="data-mono text-on-surface-variant">{t.participantCount}</span>
        <StatusChip status={t.status} />
      </div>
    </Link>
  );
}
```
Run → PASS.

- [ ] **Step 3: Implement the list page (Server Component + empty state in BRAND voice).**
```tsx
// apps/web/src/app/(dashboard)/tournaments/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth-guards";
import { listTournaments } from "@/server/services/tournaments";
import { TournamentListRow } from "@/components/tournament/TournamentListRow";

export default async function TournamentsPage() {
  const user = await requireUser("ORGANIZER");
  const { items } = await listTournaments(user.id, { take: 20 });
  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Tournaments</h1>
        <Link href="/tournaments/new" className="label-caps rounded-lg bg-electric-violet-strong px-4 py-2 text-background">
          New Tournament
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="kinetic-glass mt-10 rounded-2xl p-12 text-center">
          <p className="text-lg text-on-surface-variant">No tournaments yet.</p>
          <Link href="/tournaments/new" className="label-caps mt-4 inline-block text-electric-violet">
            Create your first tournament →
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {items.map((t) => <TournamentListRow key={t.id} t={t} />)}
        </div>
      )}
    </main>
  );
}
```
Commit: `git commit -am "Phase 4: tournaments list page"`.

---

## Task 14: `/tournaments/new` creation form (flow 01)

**Files:**
- Create: `apps/web/src/app/(dashboard)/tournaments/new/page.tsx`
- Create: `apps/web/src/components/tournament/CreateTournamentForm.tsx`
- Test: `apps/web/src/components/tournament/CreateTournamentForm.test.tsx`

**Interfaces:** Consumes: `createTournamentSchema` (shared client validation); `WalletButton`; `signAndSubmit`; `POST /api/tournaments`; `POST /api/uploads`; `SubmitStateModal`. / Produces: full creation form → DRAFT record + deploy XDR → Freighter sign → `/submit` deploy → redirect to detail.

- [ ] **Step 1: Write failing form test (fields, split→bps summary, validation, deploy flow).**
```tsx
// apps/web/src/components/tournament/CreateTournamentForm.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GORGORGORGORGORGORGORGORGORGORGORGORGORGORGORGORGORGORGOR"),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX", contractId: "C1", status: "ACTIVE" })),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { CreateTournamentForm } from "./CreateTournamentForm";

const REF = "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE";

describe("CreateTournamentForm", () => {
  it("renders fields + shows bps summary for 60/30/10", () => {
    render(<CreateTournamentForm passphrase="P" />);
    expect(screen.getByLabelText(/tournament name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/game title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entry fee/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/referee/i)).toBeInTheDocument();
    expect(screen.getByText(/6000 \/ 3000 \/ 1000 bps/i)).toBeInTheDocument();
  });
  it("blocks submit when split does not sum to 100", () => {
    render(<CreateTournamentForm passphrase="P" />);
    fireEvent.change(screen.getByLabelText(/1st %/i), { target: { value: "50" } });
    expect(screen.getByText(/must sum to 100/i)).toBeInTheDocument();
  });
  it("creates then signs+submits the deploy and redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { tournamentId: "t_1", unsignedXdr: "U", network: "testnet" } }),
      { status: 201, headers: { "content-type": "application/json" } })));
    render(<CreateTournamentForm passphrase="P" />);
    fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: "Cup" } });
    fireEvent.change(screen.getByLabelText(/game title/i), { target: { value: "SF6" } });
    fireEvent.change(screen.getByLabelText(/entry fee/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/referee/i), { target: { value: REF } });
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GORGOR…RGOR/);
    fireEvent.click(screen.getByRole("button", { name: /deploy soroban contract/i }));
    const { signAndSubmit } = await import("@/lib/wallet");
    await waitFor(() => expect(signAndSubmit).toHaveBeenCalledWith("U", "deploy", "/api/tournaments/t_1/submit", "P"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tournaments/t_1"));
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `CreateTournamentForm` (entry fee → stroops BigInt; split % → bps; cover upload optional).**
```tsx
// apps/web/src/components/tournament/CreateTournamentForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";
import { createTournamentSchema } from "@/lib/validation/tournament";

const STROOPS = 10_000_000n;
function toStroops(xlm: string): string {
  const [whole, frac = ""] = xlm.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return (BigInt(whole || "0") * STROOPS + BigInt(padded || "0")).toString();
}

export function CreateTournamentForm({ passphrase }: { passphrase: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [asset, setAsset] = useState<"XLM" | "USDC">("XLM");
  const [refereeAddress, setRefereeAddress] = useState("");
  const [organizerAddress, setOrganizerAddress] = useState("");
  const [splits, setSplits] = useState<[number, number, number]>([60, 30, 10]);
  const [coverImageKey, setCoverImageKey] = useState<string | undefined>();
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const bps = splits.map((s) => s * 100) as [number, number, number];
  const sum = splits[0] + splits[1] + splits[2];
  const splitValid = sum === 100;

  async function uploadCover(file: File) {
    const presign = await fetch("/api/uploads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
    }).then((r) => r.json());
    if (!presign.ok) throw new Error(presign.error);
    await fetch(presign.data.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    setCoverImageKey(presign.data.key);
  }

  async function onDeploy() {
    setError(null);
    const payload = {
      name, gameTitle, entryFee: toStroops(entryFee || "0"), asset,
      refereeAddress, organizerAddress, distributionBps: bps, coverImageKey,
    };
    const parsed = createTournamentSchema.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid input"); return; }
    try {
      setPhase("submitting");
      const created = await fetch("/api/tournaments", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!created.ok) throw new Error(created.error);
      setPhase("signing");
      await signAndSubmit(created.data.unsignedXdr, "deploy",
        `/api/tournaments/${created.data.tournamentId}/submit`, passphrase);
      router.push(`/tournaments/${created.data.tournamentId}`);
    } catch (e: any) { setPhase("error"); setError(e.message); }
  }

  const field = "w-full rounded-xl bg-surface-container-low border border-outline-variant px-4 py-3 text-on-surface focus:border-electric-violet-strong focus:outline focus:outline-1 focus:outline-electric-violet-strong";
  const lbl = "label-caps block mb-2 text-on-surface-variant";

  return (
    <form className="kinetic-glass rounded-2xl p-8" onSubmit={(e) => { e.preventDefault(); onDeploy(); }}>
      <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Create Tournament</h1>

      <label className={lbl} htmlFor="name">Tournament name</label>
      <input id="name" className={field} value={name} onChange={(e) => setName(e.target.value)} required />

      <label className={`${lbl} mt-6`} htmlFor="game">Game title</label>
      <input id="game" className={field} value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} required />

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className={lbl} htmlFor="fee">Entry fee</label>
          <input id="fee" inputMode="decimal" className={`${field} data-mono text-acid-yellow`}
            value={entryFee} onChange={(e) => setEntryFee(e.target.value)} required />
        </div>
        <div>
          <label className={lbl} htmlFor="asset">Asset</label>
          <select id="asset" className={field} value={asset} onChange={(e) => setAsset(e.target.value as any)}>
            <option value="XLM">XLM</option><option value="USDC">USDC</option>
          </select>
        </div>
      </div>

      <label className={`${lbl} mt-6`} htmlFor="ref">Referee wallet address</label>
      <input id="ref" className={`${field} data-mono`} placeholder="G…"
        value={refereeAddress} onChange={(e) => setRefereeAddress(e.target.value)} required />

      <fieldset className="mt-6">
        <legend className={lbl}>Prize split (%)</legend>
        <div className="grid grid-cols-3 gap-4">
          {(["1st", "2nd", "3rd"] as const).map((rank, i) => (
            <div key={rank}>
              <label className={lbl} htmlFor={`split-${i}`}>{rank} %</label>
              <input id={`split-${i}`} type="number" min={0} max={100}
                className={`${field} data-mono text-acid-yellow`} value={splits[i]}
                onChange={(e) => { const next = [...splits] as [number, number, number]; next[i] = Number(e.target.value); setSplits(next); }} />
            </div>
          ))}
        </div>
        <p className="data-mono mt-2 text-on-surface-variant">{bps[0]} / {bps[1]} / {bps[2]} bps</p>
        {!splitValid && <p className="mt-1 text-sm text-error">Split must sum to 100 ({sum} now)</p>}
      </fieldset>

      <label className={`${lbl} mt-6`} htmlFor="cover">Cover image (optional)</label>
      <input id="cover" type="file" accept="image/png,image/jpeg,image/webp" className={field}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f).catch((er) => setError(er.message)); }} />

      <div className="mt-8 flex items-center gap-4">
        <WalletButton expectedPassphrase={passphrase} onConnected={setOrganizerAddress} />
        <button type="submit" disabled={!organizerAddress || !splitValid}
          className="brutalist-border label-caps bg-electric-violet-strong px-8 py-4 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow">
          Deploy Soroban Contract
        </button>
      </div>
      {error && <p className="mt-4 text-error">{error}</p>}
      <SubmitStateModal open={phase === "signing" || phase === "submitting"} phase={phase} />
    </form>
  );
}
```

- [ ] **Step 3: Implement the page shell (passes the network passphrase down).**
```tsx
// apps/web/src/app/(dashboard)/tournaments/new/page.tsx
import { requireUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { CreateTournamentForm } from "@/components/tournament/CreateTournamentForm";

export default async function NewTournamentPage() {
  await requireUser("ORGANIZER");
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-(--spacing-margin-desktop)">
      <CreateTournamentForm passphrase={env.NETWORK_PASSPHRASE} />
    </main>
  );
}
```
Run the form test → PASS. Commit: `git commit -am "Phase 4: creation form (flow 01 create → deploy)"`.

---

## Task 15: QR + SEP-7 (`QrTile`, `JoinCard`) — flow 02

**Files:**
- Create: `apps/web/src/components/tournament/QrTile.tsx`
- Create: `apps/web/src/components/tournament/JoinCard.tsx`
- Test: `apps/web/src/components/tournament/JoinCard.test.tsx`

**Interfaces:** Consumes: `qrcode.react`; `WalletButton`; `signAndSubmit`; `POST .../join`; `ContractAddress`. / Produces: SEP-7 URI per SPEC §8, white-padded QR tile, Join button building+signing+submitting a `join_tournament` tx.

- [ ] **Step 1: Write failing JoinCard test (exact SEP-7 URI + join flow).**
```tsx
// apps/web/src/components/tournament/JoinCard.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("qrcode.react", () => ({ QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} /> }));
vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERPLAYERP"),
  signAndSubmit: vi.fn(async () => ({ txHash: "TX" })),
}));
import { JoinCard } from "./JoinCard";

const props = {
  tournamentId: "t_1", contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
  entryFee: "10000000", asset: "XLM" as const, assetIssuer: null, passphrase: "P",
};

describe("JoinCard", () => {
  it("encodes the exact SEP-7 pay URI", () => {
    render(<JoinCard {...props} />);
    const uri = screen.getByTestId("qr").getAttribute("data-value");
    expect(uri).toBe(
      "web+stellar:pay?destination=CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB&amount=10000000&memo=t_1&asset_code=XLM");
  });
  it("includes asset_issuer for non-native assets", () => {
    render(<JoinCard {...props} asset="USDC" assetIssuer="GISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERIS" />);
    expect(screen.getByTestId("qr").getAttribute("data-value"))
      .toContain("&asset_code=USDC&asset_issuer=GISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERIS");
  });
  it("builds + signs + submits join", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { unsignedXdr: "JU", network: "testnet" } }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<JoinCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GPLAYE…AYERP/);
    fireEvent.click(screen.getByRole("button", { name: /join tournament/i }));
    const { signAndSubmit } = await import("@/lib/wallet");
    await waitFor(() => expect(signAndSubmit).toHaveBeenCalledWith("JU", "join", "/api/tournaments/t_1/submit", "P"));
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `QrTile`.**
```tsx
// apps/web/src/components/tournament/QrTile.tsx
"use client";
import { QRCodeSVG } from "qrcode.react";
export function QrTile({ value }: { value: string }) {
  return (
    <div className="violet-accent inline-block rounded-xl bg-surface-container p-4">
      <div className="rounded-lg bg-white p-4">
        <QRCodeSVG value={value} size={180} level="M" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `JoinCard` (SEP-7 URI built exactly per SPEC §8).**
```tsx
// apps/web/src/components/tournament/JoinCard.tsx
"use client";
import { useState } from "react";
import { QrTile } from "./QrTile";
import { WalletButton } from "./WalletButton";
import { ContractAddress } from "./ContractAddress";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";

type Props = {
  tournamentId: string; contractId: string; entryFee: string;
  asset: "XLM" | "USDC"; assetIssuer: string | null; passphrase: string;
};

function buildSep7Uri(p: Props): string {
  const params = new URLSearchParams();
  params.set("destination", p.contractId);
  params.set("amount", p.entryFee);
  params.set("memo", p.tournamentId);
  params.set("asset_code", p.asset);
  if (p.asset !== "XLM" && p.assetIssuer) params.set("asset_issuer", p.assetIssuer);
  // SEP-7: scheme + path, then query — keep ':' and '?' literal, encode the rest
  return `web+stellar:pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function JoinCard(props: Props) {
  const [player, setPlayer] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const uri = buildSep7Uri(props);

  async function onJoin() {
    if (!player) return;
    setError(null);
    try {
      setPhase("submitting");
      const built = await fetch(`/api/tournaments/${props.tournamentId}/join`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerAddress: player }),
      }).then((r) => r.json());
      if (!built.ok) throw new Error(built.error);
      setPhase("signing");
      await signAndSubmit(built.data.unsignedXdr, "join",
        `/api/tournaments/${props.tournamentId}/submit`, props.passphrase);
      setPhase("idle");
    } catch (e: any) { setPhase("error"); setError(e.message); }
  }

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Scan to join</p>
      <div className="mt-4 flex flex-col items-start gap-4">
        <QrTile value={uri} />
        <ContractAddress value={props.contractId} />
        <code className="data-mono break-all text-xs text-on-surface-variant">{uri}</code>
        <div className="flex items-center gap-3">
          <WalletButton expectedPassphrase={props.passphrase} onConnected={setPlayer} />
          <button type="button" onClick={onJoin} disabled={!player}
            className="brutalist-border label-caps bg-electric-violet-strong px-6 py-3 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow">
            Join Tournament
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-error">{error}</p>}
      <SubmitStateModal open={phase === "signing" || phase === "submitting"} phase={phase} />
    </div>
  );
}
```
Run → PASS. Commit: `git commit -am "Phase 4: SEP-7 QR + JoinCard (flow 02 join)"`.

---

## Task 16: PrizePoolCounter, ParticipantList, LiveFeed (polling placeholders for Phase 5)

**Files:**
- Create: `apps/web/src/components/tournament/PrizePoolCounter.tsx`
- Create: `apps/web/src/components/tournament/ParticipantList.tsx`
- Create: `apps/web/src/components/tournament/LiveFeed.tsx`
- Test: `apps/web/src/components/tournament/PrizePoolCounter.test.tsx`, `apps/web/src/components/tournament/LiveFeed.test.tsx`

**Interfaces:** Consumes: `GET /api/tournaments/[id]` (polling fallback). / Produces (Phase 5 consumes): `<PrizePoolCounter tournamentId initialPool asset>`, `<LiveFeed tournamentId>` — both poll `GET /api/tournaments/[id]` now; Phase 5 swaps the data source to SSE. `<ParticipantList participants>` server-rendered.

- [ ] **Step 1: Write failing PrizePoolCounter test (big acid number, polls, reduced-motion).**
```tsx
// apps/web/src/components/tournament/PrizePoolCounter.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PrizePoolCounter } from "./PrizePoolCounter";

describe("PrizePoolCounter", () => {
  it("renders the initial pool in acid data-mono and the unit", () => {
    render(<PrizePoolCounter tournamentId="t_1" initialPool="30000000" asset="XLM" participantCount={3} entryFee="10000000" />);
    const num = screen.getByTestId("pool-amount");
    expect(num).toHaveTextContent("3.0000000");
    expect(num.className).toMatch(/acid-yellow/);
    expect(screen.getByText("XLM")).toBeInTheDocument();
  });
  it("polls GET /api/tournaments/[id] and updates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { pool: "50000000", participants: [1,2,3,4,5] } }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<PrizePoolCounter tournamentId="t_1" initialPool="30000000" asset="XLM" participantCount={3} entryFee="10000000" pollMs={10} />);
    await waitFor(() => expect(screen.getByTestId("pool-amount")).toHaveTextContent("5.0000000"));
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `PrizePoolCounter` (polling fallback; Phase 5 replaces source).**
```tsx
// apps/web/src/components/tournament/PrizePoolCounter.tsx
"use client";
import { useEffect, useState } from "react";

function fmt(stroops: string) {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}
export function PrizePoolCounter({
  tournamentId, initialPool, asset, participantCount, entryFee, pollMs = 5000,
}: {
  tournamentId: string; initialPool: string; asset: "XLM" | "USDC";
  participantCount: number; entryFee: string; pollMs?: number;
}) {
  const [pool, setPool] = useState(initialPool);
  const [count, setCount] = useState(participantCount);
  // POLLING FALLBACK — Phase 5 replaces this with the SSE source.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/tournaments/${tournamentId}`).then((x) => x.json());
        if (r.ok) { setPool(r.data.pool); setCount(r.data.participants.length); }
      } catch {}
    }, pollMs);
    return () => clearInterval(id);
  }, [tournamentId, pollMs]);

  return (
    <div className="high-contrast-card acid-glow rounded-none p-8">
      <p className="label-caps text-on-surface-variant">Prize pool</p>
      <p className="mt-2 flex items-end gap-3">
        <span data-testid="pool-amount"
          className="data-mono text-[96px] font-extrabold leading-none text-acid-yellow motion-safe:transition-transform">
          {fmt(pool)}
        </span>
        <span className="label-caps mb-3 text-on-surface-variant">{asset}</span>
      </p>
      <div className="data-mono mt-4 flex gap-6 text-on-surface-variant">
        <span>{count} players</span>
        <span>entry {fmt(entryFee)} {asset}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `ParticipantList` (server-rendered, data-mono).**
```tsx
// apps/web/src/components/tournament/ParticipantList.tsx
type P = { playerAddr: string; joinedAt: string };
function trunc(a: string) { return `${a.slice(0, 6)}…${a.slice(-6)}`; }
export function ParticipantList({ participants }: { participants: P[] }) {
  if (participants.length === 0)
    return <p className="text-on-surface-variant">No players have joined yet.</p>;
  return (
    <ul className="divide-y divide-outline-variant">
      {participants.map((p) => (
        <li key={p.playerAddr} className="flex items-center justify-between py-3">
          <span className="data-mono text-acid-yellow">{trunc(p.playerAddr)}</span>
          <time className="data-mono text-xs text-on-surface-variant" dateTime={p.joinedAt}>
            {new Date(p.joinedAt).toLocaleTimeString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write failing LiveFeed test + implement (ticker placeholder, polling, reduced-motion).**
```tsx
// apps/web/src/components/tournament/LiveFeed.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.stubGlobal("fetch", vi.fn(async () => new Response(
  JSON.stringify({ ok: true, data: { participants: [{ playerAddr: "GAAAAAAAAAAAAAAAAAAA", joinedAt: new Date().toISOString() }] } }),
  { status: 200, headers: { "content-type": "application/json" } })));
import { LiveFeed } from "./LiveFeed";
describe("LiveFeed", () => {
  it("renders a live region with the placeholder ticker", () => {
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
  });
});
```
```tsx
// apps/web/src/components/tournament/LiveFeed.tsx
"use client";
import { useEffect, useState } from "react";

type Entry = { id: string; text: string };
export function LiveFeed({ tournamentId, pollMs = 5000 }: { tournamentId: string; pollMs?: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  // POLLING PLACEHOLDER — Phase 5 wires this to SSE GET /api/tournaments/[id]/events.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/tournaments/${tournamentId}`).then((x) => x.json());
        if (r.ok) {
          setEntries(r.data.participants.map((p: any) => ({
            id: p.playerAddr, text: `${p.playerAddr.slice(0, 6)}… joined`,
          })));
        }
      } catch {}
    }, pollMs);
    return () => clearInterval(id);
  }, [tournamentId, pollMs]);

  return (
    <section className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Live activity</p>
      <div role="log" aria-live="polite" className="mt-4 max-h-80 overflow-hidden">
        <ul className="motion-safe:animate-[ticker-scroll_30s_linear_infinite] motion-reduce:animate-none">
          {entries.length === 0
            ? <li className="data-mono text-on-surface-variant">Waiting for on-chain activity…</li>
            : entries.map((e) => <li key={e.id} className="data-mono py-1 text-on-surface">{e.text}</li>)}
        </ul>
      </div>
    </section>
  );
}
```
Run both → PASS. Commit: `git commit -am "Phase 4: prize counter, participant list, live feed (polling placeholders for Phase 5)"`.

---

## Task 17: WinnersPanel, RefereePanel, CancelButton

**Files:**
- Create: `apps/web/src/components/tournament/WinnersPanel.tsx`
- Create: `apps/web/src/components/tournament/RefereePanel.tsx`
- Create: `apps/web/src/components/tournament/CancelButton.tsx`
- Test: `apps/web/src/components/tournament/WinnersPanel.test.tsx`, `apps/web/src/components/tournament/RefereePanel.test.tsx`, `apps/web/src/components/tournament/CancelButton.test.tsx`

**Interfaces:** Consumes: `signAndSubmit`; `WalletButton`/`ensureWallet`; `POST .../cancel`. / Produces: finished-state winners + explorer links; referee panel gated on wallet === refereeAddr; organiser cancel flow (flow 04).

- [ ] **Step 1: Write failing WinnersPanel test (explorer links + amounts).**
```tsx
// apps/web/src/components/tournament/WinnersPanel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WinnersPanel } from "./WinnersPanel";
describe("WinnersPanel", () => {
  it("renders three ranks with explorer links and mono amounts", () => {
    render(<WinnersPanel asset="XLM" winners={[
      { rank: 1, playerAddr: "GAAAAAAAAAAAAAAAAAAA", amount: "18000000", txHash: "P1", explorerUrl: "https://stellar.expert/tx/P1" },
      { rank: 2, playerAddr: "GBBBBBBBBBBBBBBBBBBB", amount: "9000000", txHash: "P2", explorerUrl: "https://stellar.expert/tx/P2" },
      { rank: 3, playerAddr: "GCCCCCCCCCCCCCCCCCCC", amount: "3000000", txHash: "P3", explorerUrl: "https://stellar.expert/tx/P3" },
    ]} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("1.8000000 XLM")).toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement WinnersPanel.**
```tsx
// apps/web/src/components/tournament/WinnersPanel.tsx
type W = { rank: number; playerAddr: string; amount: string; txHash: string | null; explorerUrl: string | null };
function fmt(s: string) { const n = BigInt(s); return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`; }
const medal = ["military_tech", "workspace_premium", "stars"];
export function WinnersPanel({ winners, asset }: { winners: W[]; asset: "XLM" | "USDC" }) {
  return (
    <div className="brutalist-border brutalist-border-active rounded-none p-6">
      <p className="label-caps italic text-acid-yellow">Settlement Complete</p>
      <ul className="mt-4 flex flex-col gap-3">
        {winners.map((w) => (
          <li key={w.rank} className="flex items-center justify-between">
            <span className="flex items-center gap-3">
              <span className="material-symbols-outlined text-acid-yellow" aria-hidden>{medal[w.rank - 1]}</span>
              <span className="data-mono text-on-surface">{w.playerAddr.slice(0, 6)}…{w.playerAddr.slice(-6)}</span>
            </span>
            <span className="flex items-center gap-4">
              <span className="data-mono text-acid-yellow">{fmt(w.amount)} {asset}</span>
              {w.explorerUrl && (
                <a href={w.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="label-caps text-electric-violet underline">Explorer</a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```
Run → PASS.

- [ ] **Step 3: Write failing RefereePanel test (gated on wallet == refereeAddr) + implement.**
```tsx
// apps/web/src/components/tournament/RefereePanel.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/wallet", () => ({ ensureWallet: vi.fn(async () => "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE") }));
import { RefereePanel } from "./RefereePanel";
const REF = "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE";
describe("RefereePanel", () => {
  it("reveals the settle link only when connected wallet matches refereeAddr", async () => {
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    expect(screen.queryByRole("link", { name: /settlement console/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: /settlement console/i }))
      .toHaveAttribute("href", "/tournaments/t_1/settle"));
  });
  it("shows a mismatch message for a non-referee wallet", async () => {
    const { ensureWallet } = await import("@/lib/wallet");
    (ensureWallet as any).mockResolvedValueOnce("GOTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHER");
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() => expect(screen.getByText(/not the referee/i)).toBeInTheDocument());
  });
});
```
```tsx
// apps/web/src/components/tournament/RefereePanel.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { ensureWallet } from "@/lib/wallet";
export function RefereePanel({
  tournamentId, refereeAddr, passphrase,
}: { tournamentId: string; refereeAddr: string; passphrase: string }) {
  const [state, setState] = useState<"idle" | "match" | "mismatch" | "error">("idle");
  return (
    <div className="violet-accent rounded-xl bg-surface-container p-6">
      <p className="label-caps text-electric-violet">Referee</p>
      {state === "match" ? (
        <Link href={`/tournaments/${tournamentId}/settle`}
          className="brutalist-border label-caps mt-4 inline-block bg-electric-violet-strong px-6 py-3 italic text-background">
          Open Settlement Console
        </Link>
      ) : (
        <button type="button" className="label-caps mt-4 rounded-lg border-2 border-outline px-4 py-2 text-on-surface"
          onClick={async () => {
            try { const a = await ensureWallet(passphrase); setState(a === refereeAddr ? "match" : "mismatch"); }
            catch { setState("error"); }
          }}>
          Verify Referee Wallet
        </button>
      )}
      {state === "mismatch" && <p className="mt-3 text-error">Connected wallet is not the referee for this tournament.</p>}
    </div>
  );
}
```
Run → PASS.

- [ ] **Step 4: Write failing CancelButton test (flow 04) + implement.**
```tsx
// apps/web/src/components/tournament/CancelButton.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/wallet", () => ({ signAndSubmit: vi.fn(async () => ({ txHash: "TX", status: "CANCELLED" })) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { CancelButton } from "./CancelButton";
describe("CancelButton", () => {
  it("builds + signs + submits cancel then refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { unsignedXdr: "CU", network: "testnet" } }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    const { signAndSubmit } = await import("@/lib/wallet");
    await waitFor(() => expect(signAndSubmit).toHaveBeenCalledWith("CU", "cancel", "/api/tournaments/t_1/submit", "P"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
```
```tsx
// apps/web/src/components/tournament/CancelButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signAndSubmit } from "@/lib/wallet";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
export function CancelButton({ tournamentId, passphrase }: { tournamentId: string; passphrase: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  async function onCancel() {
    setError(null);
    try {
      setPhase("submitting");
      const built = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" }).then((r) => r.json());
      if (!built.ok) throw new Error(built.error);
      setPhase("signing");
      await signAndSubmit(built.data.unsignedXdr, "cancel", `/api/tournaments/${tournamentId}/submit`, passphrase);
      setPhase("idle");
      router.refresh();
    } catch (e: any) { setPhase("error"); setError(e.message); }
  }
  return (
    <>
      <button type="button" onClick={onCancel}
        className="label-caps rounded-lg border-2 border-error px-4 py-2 text-error hover:bg-error-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-error">
        Cancel & Refund
      </button>
      {error && <p className="mt-2 text-error">{error}</p>}
      <SubmitStateModal open={phase === "signing" || phase === "submitting"} phase={phase} />
    </>
  );
}
```
Run → PASS. Commit: `git commit -am "Phase 4: winners, referee panel, cancel button (flow 04)"`.

---

## Task 18: `/tournaments/[id]` detail page (compose all panels)

**Files:**
- Create: `apps/web/src/app/tournaments/[id]/page.tsx`
- Test: `apps/web/src/app/tournaments/[id]/page.test.tsx`

**Interfaces:** Consumes: `getTournamentDetail` service; `env.NETWORK_PASSPHRASE`/`env.USDC_ISSUER`; all Task 10/15/16/17 components. / Produces: public Server Component composing header (name, game, id, copyable contract addr, status, balance), prize pool, join/QR, participants, live feed, referee panel, finished-state winners.

- [ ] **Step 1: Write failing detail page test (header + panels, finished branch).**
```tsx
// apps/web/src/app/tournaments/[id]/page.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/services/tournaments", () => ({
  getTournamentDetail: vi.fn(async () => ({
    id: "t_1", name: "Cup", gameTitle: "SF6", status: "ACTIVE", asset: "XLM",
    entryFee: "10000000", distributionBps: [6000, 3000, 1000],
    contractId: "CONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTCONTRACTAB",
    contractUrl: "https://stellar.expert/c/C1",
    tokenAddr: "CSAC", organizerAddr: "GORG", refereeAddr: "GREF",
    pool: "30000000",
    participants: [{ playerAddr: "GP1AAAAAAAAAAAAAAAAA", joinedAt: new Date().toISOString(), joinTxHash: "J1" }],
    winners: [],
  })),
}));
vi.mock("@/lib/env", () => ({ env: { NETWORK_PASSPHRASE: "P", USDC_ISSUER: "GISSUER" } }));
import Page from "./page";

describe("/tournaments/[id]", () => {
  it("renders header, status, prize pool, and QR join card when ACTIVE", async () => {
    const ui = await Page({ params: Promise.resolve({ id: "t_1" }) });
    render(ui);
    expect(screen.getByRole("heading", { name: "Cup" })).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("3.0000000");
    expect(screen.getByText(/scan to join/i)).toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement the detail page (Server Component; `notFound()` on missing).**
```tsx
// apps/web/src/app/tournaments/[id]/page.tsx
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getTournamentDetail } from "@/server/services/tournaments";
import { StatusChip } from "@/components/tournament/StatusChip";
import { ContractAddress } from "@/components/tournament/ContractAddress";
import { PrizePoolCounter } from "@/components/tournament/PrizePoolCounter";
import { JoinCard } from "@/components/tournament/JoinCard";
import { ParticipantList } from "@/components/tournament/ParticipantList";
import { LiveFeed } from "@/components/tournament/LiveFeed";
import { RefereePanel } from "@/components/tournament/RefereePanel";
import { WinnersPanel } from "@/components/tournament/WinnersPanel";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTournamentDetail(id);
  if (!t) notFound();
  const passphrase = env.NETWORK_PASSPHRASE;
  const assetIssuer = t.asset === "USDC" ? env.USDC_ISSUER : null;

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps text-on-surface-variant">{t.gameTitle}</p>
          <h1 className="text-[48px] font-extrabold -tracking-[0.04em] text-on-surface">{t.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <span className="data-mono text-xs text-on-surface-variant">ID {t.id}</span>
            {t.contractId && <ContractAddress value={t.contractId} />}
          </div>
        </div>
        <StatusChip status={t.status} />
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <PrizePoolCounter tournamentId={t.id} initialPool={t.pool} asset={t.asset}
            participantCount={t.participants.length} entryFee={t.entryFee} />

          {t.status === "ACTIVE" && t.contractId && (
            <JoinCard tournamentId={t.id} contractId={t.contractId} entryFee={t.entryFee}
              asset={t.asset} assetIssuer={assetIssuer} passphrase={passphrase} />
          )}

          {t.status === "FINISHED" && t.winners.length > 0 && (
            <WinnersPanel winners={t.winners} asset={t.asset} />
          )}

          <section className="kinetic-glass rounded-2xl p-6">
            <p className="label-caps text-on-surface-variant">Participants</p>
            <div className="mt-4"><ParticipantList participants={t.participants} /></div>
          </section>
        </div>

        <aside className="flex flex-col gap-8 lg:col-span-4">
          <LiveFeed tournamentId={t.id} />
          {t.status === "ACTIVE" && (
            <RefereePanel tournamentId={t.id} refereeAddr={t.refereeAddr} passphrase={passphrase} />
          )}
        </aside>
      </div>
    </main>
  );
}
```
Run → PASS. Commit: `git commit -am "Phase 4: tournament detail page (compose all panels)"`.

---

## Task 19: Settlement console drag-and-drop (`/settle`) — flow 03

**Files:**
- Create: `apps/web/src/components/settlement/CandidateCard.tsx`
- Create: `apps/web/src/components/settlement/PodiumSlot.tsx`
- Create: `apps/web/src/components/settlement/SettlementModal.tsx`
- Create: `apps/web/src/components/settlement/SettlementConsole.tsx`
- Create: `apps/web/src/app/(dashboard)/tournaments/[id]/settle/page.tsx`
- Test: `apps/web/src/components/settlement/SettlementConsole.test.tsx`

**Interfaces:** Consumes: `getTournamentDetail`; `WalletButton`/`ensureWallet`; `signAndSubmit`; `POST .../finalize` (sends `x-wallet-address`). / Produces: drag-and-drop console assigning 1st/2nd/3rd, validates distinct+all-filled, builds+signs+submits `finalize_results` (flow 03).

- [ ] **Step 1: Write failing console test (assign via native DnD + finalize flow).**
```tsx
// apps/web/src/components/settlement/SettlementConsole.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE"),
  signAndSubmit: vi.fn(async () => ({ txHash: "FTX", status: "FINISHED" })),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { SettlementConsole } from "./SettlementConsole";

const REF = "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE";
const players = [
  { playerAddr: "GAAAAAAAAAAAAAAAAAAA", joinedAt: "" },
  { playerAddr: "GBBBBBBBBBBBBBBBBBBB", joinedAt: "" },
  { playerAddr: "GCCCCCCCCCCCCCCCCCCC", joinedAt: "" },
];
function dropOnto(slotTestId: string, addr: string) {
  const slot = screen.getByTestId(slotTestId);
  const dt = { getData: () => addr, setData: () => {}, dropEffect: "" } as any;
  fireEvent.drop(slot, { dataTransfer: dt });
}

describe("SettlementConsole", () => {
  it("assigns three distinct winners then finalizes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { unsignedXdr: "FU", network: "testnet" } }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<SettlementConsole tournamentId="t_1" refereeAddr={REF} participants={players} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/);
    dropOnto("slot-1", players[0].playerAddr);
    dropOnto("slot-2", players[1].playerAddr);
    dropOnto("slot-3", players[2].playerAddr);
    fireEvent.click(screen.getByRole("button", { name: /finalize payouts/i }));
    const { signAndSubmit } = await import("@/lib/wallet");
    await waitFor(() => expect(signAndSubmit).toHaveBeenCalledWith("FU", "finalize", "/api/tournaments/t_1/submit", "P"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tournaments/t_1"));
  });
  it("disables finalize until all three slots are filled", () => {
    render(<SettlementConsole tournamentId="t_1" refereeAddr={REF} participants={players} passphrase="P" />);
    expect(screen.getByRole("button", { name: /finalize payouts/i })).toBeDisabled();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `CandidateCard` (draggable, grayscale→color).**
```tsx
// apps/web/src/components/settlement/CandidateCard.tsx
"use client";
export function CandidateCard({ addr, used }: { addr: string; used: boolean }) {
  return (
    <div
      draggable={!used}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", addr)}
      data-addr={addr}
      className={`brutalist-border flex items-center gap-3 rounded-none bg-surface-container p-3 ${
        used ? "opacity-30" : "cursor-grab active:translate-x-0.5 active:translate-y-0.5"
      }`}
    >
      <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>account_circle</span>
      <span className="data-mono text-on-surface">{addr.slice(0, 6)}…{addr.slice(-6)}</span>
    </div>
  );
}
```

- [ ] **Step 3: Implement `PodiumSlot` (drop zone, acid highlight).**
```tsx
// apps/web/src/components/settlement/PodiumSlot.tsx
"use client";
import { useState } from "react";
export function PodiumSlot({
  rank, addr, onAssign,
}: { rank: 1 | 2 | 3; addr: string | null; onAssign: (addr: string) => void }) {
  const [active, setActive] = useState(false);
  const label = ["1st", "2nd", "3rd"][rank - 1];
  return (
    <div
      data-testid={`slot-${rank}`}
      onDragOver={(e) => { e.preventDefault(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => { e.preventDefault(); setActive(false); onAssign(e.dataTransfer.getData("text/plain")); }}
      className={`flex h-24 flex-col items-center justify-center rounded-none border-2 p-4 ${
        active ? "border-acid-yellow bg-surface-container-high" : addr ? "brutalist-border-active" : "border-dashed border-outline"
      }`}
    >
      <span className="label-caps italic text-acid-yellow">{label}</span>
      {addr
        ? <span className="data-mono mt-2 text-on-surface">{addr.slice(0, 6)}…{addr.slice(-6)}</span>
        : <span className="data-mono mt-2 text-on-surface-variant">drop a player</span>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `SettlementModal`.**
```tsx
// apps/web/src/components/settlement/SettlementModal.tsx
"use client";
export function SettlementModal({ open, status }: { open: boolean; status: string }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Finalizing payouts"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/85 backdrop-blur-md">
      <div className="h-20 w-20 animate-spin rounded-full border-4 border-outline-variant border-t-acid-yellow motion-reduce:animate-none" />
      <p className="label-caps mt-6 italic text-acid-yellow">{status}</p>
    </div>
  );
}
```

- [ ] **Step 5: Implement `SettlementConsole`.**
```tsx
// apps/web/src/components/settlement/SettlementConsole.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateCard } from "./CandidateCard";
import { PodiumSlot } from "./PodiumSlot";
import { SettlementModal } from "./SettlementModal";
import { WalletButton } from "@/components/tournament/WalletButton";
import { signAndSubmit } from "@/lib/wallet";

type P = { playerAddr: string; joinedAt: string };
export function SettlementConsole({
  tournamentId, refereeAddr, participants, passphrase,
}: { tournamentId: string; refereeAddr: string; participants: P[]; passphrase: string }) {
  const router = useRouter();
  const [wallet, setWallet] = useState<string | null>(null);
  const [slots, setSlots] = useState<[string | null, string | null, string | null]>([null, null, null]);
  const [phase, setPhase] = useState<"idle" | "signing" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const used = new Set(slots.filter(Boolean) as string[]);
  const assign = (rank: 1 | 2 | 3) => (addr: string) =>
    setSlots((prev) => {
      const next = prev.map((s) => (s === addr ? null : s)) as typeof prev; // de-dupe across slots
      next[rank - 1] = addr;
      return next;
    });
  const ready = wallet === refereeAddr && slots.every(Boolean) && new Set(slots).size === 3;

  async function finalize() {
    setError(null);
    try {
      setPhase("submitting");
      const built = await fetch(`/api/tournaments/${tournamentId}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-wallet-address": wallet! },
        body: JSON.stringify({ first: slots[0], second: slots[1], third: slots[2] }),
      }).then((r) => r.json());
      if (!built.ok) throw new Error(built.error);
      setPhase("signing");
      await signAndSubmit(built.data.unsignedXdr, "finalize", `/api/tournaments/${tournamentId}/submit`, passphrase);
      router.push(`/tournaments/${tournamentId}`);
    } catch (e: any) { setPhase("error"); setError(e.message); }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <section className="brutalist-border rounded-none p-8 lg:col-span-8">
        <h1 className="text-[32px] font-bold italic -tracking-[0.02em] text-on-surface">Referee Settlement Console</h1>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {([1, 2, 3] as const).map((r) => (
            <PodiumSlot key={r} rank={r} addr={slots[r - 1]} onAssign={assign(r)} />
          ))}
        </div>
        <div className="mt-8 flex items-center gap-4">
          <WalletButton expectedPassphrase={passphrase} onConnected={setWallet} />
          <button type="button" disabled={!ready} onClick={finalize}
            className="brutalist-border label-caps bg-electric-violet-strong px-8 py-4 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow">
            Finalize Payouts
          </button>
        </div>
        {wallet && wallet !== refereeAddr && <p className="mt-3 text-error">Connected wallet is not the referee.</p>}
        {error && <p className="mt-3 text-error">{error}</p>}
      </section>

      <aside className="glass-panel rounded-xl p-6 lg:col-span-4">
        <p className="label-caps text-on-surface-variant">Candidates</p>
        <div className="mt-4 flex flex-col gap-3">
          {participants.map((p) => (
            <CandidateCard key={p.playerAddr} addr={p.playerAddr} used={used.has(p.playerAddr)} />
          ))}
        </div>
      </aside>
      <SettlementModal open={phase === "signing" || phase === "submitting"}
        status={phase === "signing" ? "SIGNING…" : "SUBMITTING…"} />
    </div>
  );
}
```

- [ ] **Step 6: Implement the `/settle` page shell (referee context; participants from detail).**
```tsx
// apps/web/src/app/(dashboard)/tournaments/[id]/settle/page.tsx
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth-guards";
import { getTournamentDetail } from "@/server/services/tournaments";
import { SettlementConsole } from "@/components/settlement/SettlementConsole";

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(); // logged-in; referee identity enforced client-side + by contract require_auth
  const { id } = await params;
  const t = await getTournamentDetail(id);
  if (!t || t.status !== "ACTIVE") notFound();
  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <SettlementConsole tournamentId={t.id} refereeAddr={t.refereeAddr}
        participants={t.participants} passphrase={env.NETWORK_PASSPHRASE} />
    </main>
  );
}
```
Run the console test → PASS. Commit: `git commit -am "Phase 4: settlement console drag-and-drop (flow 03 finalize)"`.

---

## Task 20: `/admin` page (user management + overview)

**Files:**
- Create: `apps/web/src/app/(dashboard)/admin/page.tsx`
- Create: `apps/web/src/server/services/admin.ts`
- Test: `apps/web/src/server/services/admin.test.ts`

**Interfaces:** Consumes: Phase 3 `requireUser("ADMIN")`; Phase 0 `prisma`. / Produces: ADMIN-gated overview (user count, tournament count by status) + user list (username, role, created).

- [ ] **Step 1: Write failing admin service test.**
```ts
// apps/web/src/server/services/admin.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {
  user: { count: vi.fn(async () => 4), findMany: vi.fn(async () => [
    { id: "u1", username: "admin", role: "ADMIN", createdAt: new Date(0) }]) },
  tournament: { groupBy: vi.fn(async () => [{ status: "ACTIVE", _count: { _all: 2 } }]) },
} }));
import { getAdminOverview } from "./admin";
describe("getAdminOverview", () => {
  it("returns counts and users", async () => {
    const o = await getAdminOverview();
    expect(o.userCount).toBe(4);
    expect(o.byStatus.ACTIVE).toBe(2);
    expect(o.users[0].username).toBe("admin");
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `getAdminOverview`.**
```ts
// apps/web/src/server/services/admin.ts
import { prisma } from "@/lib/db";
export async function getAdminOverview() {
  const [userCount, grouped, users] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  const byStatus: Record<string, number> = { DRAFT: 0, ACTIVE: 0, FINISHED: 0, CANCELLED: 0 };
  for (const g of grouped) byStatus[g.status] = g._count._all;
  return {
    userCount, byStatus,
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  };
}
```

- [ ] **Step 3: Implement the admin page (Server Component, ADMIN-gated).**
```tsx
// apps/web/src/app/(dashboard)/admin/page.tsx
import { requireUser } from "@/lib/auth-guards";
import { getAdminOverview } from "@/server/services/admin";

export default async function AdminPage() {
  await requireUser("ADMIN");
  const o = await getAdminOverview();
  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Admin</h1>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="glass-panel rounded-xl p-6">
          <p className="label-caps text-on-surface-variant">Users</p>
          <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.userCount}</p>
        </div>
        {(["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"] as const).map((s) => (
          <div key={s} className="glass-panel rounded-xl p-6">
            <p className="label-caps text-on-surface-variant">{s}</p>
            <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.byStatus[s]}</p>
          </div>
        ))}
      </div>
      <table className="mt-10 w-full">
        <thead>
          <tr className="label-caps text-left text-on-surface-variant">
            <th className="py-2">Username</th><th>Role</th><th>Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {o.users.map((u) => (
            <tr key={u.id} className="data-mono text-on-surface">
              <td className="py-3">{u.username}</td>
              <td>{u.role}</td>
              <td className="text-on-surface-variant">{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```
Run → PASS. Commit: `git commit -am "Phase 4: admin overview page"`.

---

## Task 21: Phase-4 verification sweep

**Files:**
- Modify: none (verification only)

**Interfaces:** Consumes: every artifact above. / Produces: a green Phase-4 gate.

- [ ] **Step 1: Run the full Phase-4 test suite.** `pnpm --filter web vitest run` → expect all Phase-4 tests green.
- [ ] **Step 2: Typecheck.** `pnpm --filter web typecheck` (or `pnpm --filter web exec tsc --noEmit`) → expect 0 errors.
- [ ] **Step 3: Lint.** `pnpm --filter web lint` → expect 0 errors.
- [ ] **Step 4: Manual brand/a11y review checklist (record results in the PR description):**
  - Every interactive control has a visible `electric-violet`/`acid-yellow` focus ring.
  - All animations are wrapped in `motion-safe:`/`motion-reduce:` (PrizePoolCounter pop, LiveFeed ticker, spinner modals).
  - Addresses/amounts/IDs use `data-mono`; eyebrow/button labels use `label-caps`.
  - Primary irreversible buttons (Deploy / Finalize) are solid `electric-violet-strong` with brutalist offset; cancel uses `error` outline.
  - Pages reflow to a single column at mobile widths.
- [ ] **Step 5: Confirm the four operational flows are wired end-to-end** (create → deploy via `CreateTournamentForm`; join via `JoinCard`; finalize via `SettlementConsole`; cancel via `CancelButton`), each calling `signAndSubmit(..., intent, "/api/tournaments/[id]/submit", passphrase)`.
- [ ] **Step 6:** Commit any fixes from the sweep: `git commit -am "Phase 4: verification sweep fixes"`.

---

## Self-review (against SPEC §5/§6/§8/§9/§13 + BRAND + AGENT §4/§5/§7)

- **§6 endpoints:** `POST /api/tournaments` (T2), `POST .../submit` (T3), `GET /api/tournaments` (T4), `GET /api/tournaments/[id]` (T4), `POST .../join` (T5), `POST .../finalize` (T6), `POST .../cancel` (T7), `POST /api/uploads` (T8). `GET .../events` (SSE) is explicitly Phase 5 — represented here by polling placeholders in `PrizePoolCounter`/`LiveFeed`. ✔
- **§5 pages:** `/` (T11), `/login`+`/register` (T12, integrate-not-duplicate), `/tournaments` (T13), `/tournaments/new` (T14), `/tournaments/[id]` (T18), `/tournaments/[id]/settle` (T19), `/admin` (T20). All detail panels (header, copyable contract addr, prize counter, QR/join, participants, live feed, referee panel, finished winners + explorer links) covered (T15–T18). ✔
- **§8 QR/SEP-7:** exact URI `web+stellar:pay?destination=…&amount=…&memo=…&asset_code=…` (+`asset_issuer` for USDC) asserted by test in T15; deep-link join is primary (JoinCard builds a real `join_tournament` tx). ✔
- **§9 uploads:** presigned S3 PUT via `@aws-sdk/client-s3` + presigner, MIME+size validation, server-generated key (never trusts client filename). ✔
- **§13 flows:** 01 create→deploy (T14), 02 join (T15), 03 finalize (T19), 04 cancel (T17) — each build XDR (server) → `ensureWallet`+sign (client) → POST `/submit`. ✔
- **AGENT §4 frontend:** Server Components default, `"use client"` at leaves, shared Zod schema (T1 used in both T2 handler and T14 form), SSE-with-polling-fallback stubs, a11y + `prefers-reduced-motion`. ✔
- **AGENT §5 backend:** thin handlers + fat `tournaments.ts` service, `{ ok, data?, error? }` envelope, simulate-before-sign (inside Phase 2 builders), idempotency on `/submit` (T3). ✔
- **AGENT §7 security:** Zod-validated addresses/amounts/splits, owner-scoped list + organiser/referee gates (IDOR), CSRF `assertSameOrigin` + rate limit on every mutation, no keys on server (signing only via `lib/wallet.ts`), reconcile on confirmed `submitSignedXdr` result before persisting. ✔
- **BRAND:** kinetic-glass/brutalist/high-contrast surfaces, violet primary buttons, acid live/data, `label-caps`/`data-mono`, signing modal per §6. ✔

No placeholders remain; every step contains real code; all names match the cross-phase contract (`buildDeployInitializeTx`, `buildJoinTx`, `buildFinalizeTx`, `buildCancelTx`, `submitSignedXdr`, `resolveSacAddress`, `explorerTxUrl`/`explorerContractUrl`, validators; `requireUser`/`getCurrentUser`, `rateLimit`, `assertSameOrigin`; `prisma`, `env`, `ok`/`err`). Two consumed env keys not in SPEC §14 are introduced by this phase and must be added in Phase 0/6 env: `USDC_ISSUER` (for SEP-7 `asset_issuer`) and `NEXT_PUBLIC`-exposed network passphrase if the form/console run without a server-passed value — here the passphrase is passed from server (`env.NETWORK_PASSPHRASE`) so no public env is required.
