# Phase 5 — Event Subscriber & Live Feed Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `apps/subscriber` Railway service that ingests Soroban contract events and SEP-7 deposits idempotently into Postgres and publishes them to Redis, and wire the Phase 4 detail page to a live SSE feed so joining/finalising/cancelling propagates without a refresh.

**Architecture:** A standalone Node 22 worker (`apps/subscriber`) runs a poll loop: for each `ACTIVE` tournament it reads a per-contract ledger cursor, pulls new `getEvents` from Soroban RPC and new Horizon payments to the contract address, maps `registered`/`finalized`/`cancelled` (and reconciled SEP-7 deposits) into `ContractEvent`/`Participant`/`Payout`/`Tournament` rows via idempotent upserts deduped on `txHash`, advances the cursor, and publishes `{ type, txHash, data }` to the Redis channel `tournament:<id>`. On the web side a Next.js 16 route handler `GET /api/tournaments/[id]/events` returns a `text/event-stream` `ReadableStream` subscribed to that channel (with a polling fallback), and the Phase 4 `<LiveFeed>`/`<PrizePoolCounter>` components consume it via `EventSource` with reconnect and a `prefers-reduced-motion` guard.

**Tech Stack:** Node 22 worker, `@stellar/stellar-sdk` 15 (`rpc.Server.getEvents` + Horizon `payments()`), Prisma 7, `ioredis` pub/sub, Next.js 16 SSE route handler, Vitest.

## Global Constraints
- Subscriber is a **separate Railway service** at `apps/subscriber` (own package; shares `prisma` + types through the monorepo) — never an in-process loop in `apps/web`.
- **At-least-once** processing with a **per-contract ledger cursor**; the loop may replay a ledger range and MUST NOT double-write.
- **Idempotent upserts deduped on `txHash`** for every event/participant/payout write; a replay of the same event is a no-op.
- **Zod-validate every RPC and Horizon response** before use — treat all external payloads as untrusted.
- **SEP-7 deposits are untrusted until reconciled** to a registered player (match `memo == tournamentId`, credit the sender) — never trust a memo blindly.
- **Reconcile UI against confirmed events only** — the SSE stream emits only persisted `ContractEvent`-backed payloads, never optimistic state.
- **Redis is ephemeral, never the source of truth** — Postgres is canonical; on SSE connect, replay recent rows from the DB before live messages.
- **Money is `BigInt`** end to end (XLM stroops, `i128`); never float; serialise as decimal strings over SSE/JSON.
- **`prefers-reduced-motion`** disables the counter pop and ticker scroll in the live components.

---

## File Structure

| Path | Responsibility |
|---|---|
| `apps/subscriber/package.json` | Subscriber package manifest (`name: "subscriber"`, scripts `dev`/`build`/`start`/`test`, deps on workspace `prisma`/`@prisma/client`, `@stellar/stellar-sdk`, `ioredis`, `zod`, devDep `vitest`). |
| `apps/subscriber/tsconfig.json` | Extends the workspace base tsconfig (strict flags), `outDir dist`, `rootDir src`. |
| `apps/subscriber/vitest.config.ts` | Vitest config (node environment, `src/**/*.test.ts`). |
| `apps/subscriber/src/stellar.ts` | Thin wrapper around `@stellar/stellar-sdk` `rpc.Server` + `Horizon.Server` from `env`; exposes `getEvents(contractId, startLedger)` and `getContractPayments(addr, cursor)` with Zod-validated returns (added here because Phase 2 lives in `apps/web` and is not importable by the subscriber package). |
| `apps/subscriber/src/cursor.ts` | `getCursor(contractId)` / `setCursor(contractId, ledger)` — per-contract ledger cursor persisted in the `SubscriberCursor` table. |
| `apps/subscriber/src/reconcile.ts` | Pure mappers: `applyRegistered`/`applyFinalized`/`applyCancelled` turn a decoded event into `ContractEvent` + `Participant`/`Payout`/`Tournament` writes inside one Prisma transaction, idempotent on `txHash`. |
| `apps/subscriber/src/horizon-sep7.ts` | `reconcileSep7Deposits(tournament, cursor)` — fetch Horizon payments to the contract address, keep only `memo == tournamentId`, upsert each sender as a `Participant` + a `REGISTERED` `ContractEvent`, return new cursor + change list. |
| `apps/subscriber/src/publish.ts` | `publishChange(tournamentId, payload)` — publish `{ type, txHash, data }` JSON to Redis channel `tournament:<tournamentId>` via the shared redis client. |
| `apps/subscriber/src/poller.ts` | `pollTournament(tournament)` — orchestrates cursor → `getEvents` → reconcile → SEP-7 → publish → `setCursor`, returning the changes produced. |
| `apps/subscriber/src/index.ts` | Boot + loop: validate env, every `POLL_INTERVAL_MS` load `ACTIVE` tournaments with a `contractId` and `pollTournament` each; structured logging; graceful SIGTERM. |
| `apps/web/src/app/api/tournaments/[id]/events/route.ts` | `GET` SSE handler: `text/event-stream` `ReadableStream` that replays recent `ContractEvent` rows, subscribes to Redis `tournament:<id>`, heartbeats, and supports `?fallback=poll` long-poll mode. |
| `apps/web/src/components/live-feed.tsx` | Phase 4 `<LiveFeed tournamentId/>` wired to `EventSource` with reconnect + ticker-scroll motion (reduced-motion guard). |
| `apps/web/src/components/prize-pool-counter.tsx` | Phase 4 `<PrizePoolCounter tournamentId/>` wired to `EventSource`; pool ticks up with a `scale(1.05)` pop (reduced-motion guard). |
| `apps/web/prisma/schema.prisma` | Add the `SubscriberCursor` model (Phase 0 schema is the base; this is a new migration). |

---

## Task 1: SubscriberCursor model + migration

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<timestamp>_add_subscriber_cursor/migration.sql` (generated)

**Interfaces:** Consumes Phase 0 `prisma` schema + `prisma.config.ts`. Produces the `SubscriberCursor` table backing `cursor.ts`.

- [ ] **Step 1: Add the model to the schema.** Append to `apps/web/prisma/schema.prisma`:
  ```prisma
  model SubscriberCursor {
    contractId String   @id          // C... contract address
    ledger     Int                   // last fully-processed Soroban ledger
    hzCursor   String?               // last Horizon payments paging_token
    updatedAt  DateTime @updatedAt
  }
  ```
- [ ] **Step 2: Generate the migration.** Run `pnpm --filter web prisma migrate dev --name add_subscriber_cursor`.
  Expected output: `Applying migration ... add_subscriber_cursor` and `✔ Generated Prisma Client`.
- [ ] **Step 3: Regenerate the client for the subscriber.** Run `pnpm --filter web prisma generate`.
  Expected output: `✔ Generated Prisma Client`.
- [ ] **Step 4: Commit.**
  ```bash
  git add apps/web/prisma/schema.prisma apps/web/prisma/migrations
  git commit -m "Add SubscriberCursor model + migration for per-contract ledger cursor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 2: Scaffold the `apps/subscriber` package

**Files:**
- Create: `apps/subscriber/package.json`
- Create: `apps/subscriber/tsconfig.json`
- Create: `apps/subscriber/vitest.config.ts`
- Create: `apps/subscriber/src/index.ts` (boot stub)

**Interfaces:** Consumes Phase 0 workspace (`pnpm-workspace.yaml` already lists `apps/*`), base tsconfig, `env` loader, `prisma`/redis singletons. Produces the runnable service shell.

- [ ] **Step 1: Write `apps/subscriber/package.json`.**
  ```json
  {
    "name": "subscriber",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "engines": { "node": ">=22" },
    "scripts": {
      "dev": "tsx watch src/index.ts",
      "build": "tsc -p tsconfig.json",
      "start": "node dist/index.js",
      "test": "vitest run"
    },
    "dependencies": {
      "@prisma/client": "catalog:",
      "@stellar/stellar-sdk": "catalog:",
      "ioredis": "catalog:",
      "zod": "catalog:"
    },
    "devDependencies": {
      "tsx": "catalog:",
      "typescript": "catalog:",
      "vitest": "catalog:"
    }
  }
  ```
  (If Phase 0 did not configure a pnpm `catalog`, replace `catalog:` with the exact versions resolved by `pnpm add <pkg>@latest` and commit `pnpm-lock.yaml`.)
- [ ] **Step 2: Write `apps/subscriber/tsconfig.json`.**
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "dist",
      "rootDir": "src",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "types": ["node", "vitest/globals"]
    },
    "include": ["src"]
  }
  ```
  (If Phase 0's base tsconfig is named differently, point `extends` at the real path; it MUST carry `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.)
- [ ] **Step 3: Write `apps/subscriber/vitest.config.ts`.**
  ```ts
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: { globals: true, environment: "node", include: ["src/**/*.test.ts"] },
  });
  ```
- [ ] **Step 4: Write a boot stub `apps/subscriber/src/index.ts`.**
  ```ts
  async function main(): Promise<void> {
    // poll loop wired in Task 8
  }

  main().catch((err) => {
    console.error("[subscriber] fatal", err);
    process.exit(1);
  });
  ```
- [ ] **Step 5: Install + typecheck.** Run `pnpm install && pnpm --filter subscriber exec tsc --noEmit`.
  Expected output: install completes; `tsc` exits 0 with no errors.
- [ ] **Step 6: Commit.**
  ```bash
  git add apps/subscriber pnpm-lock.yaml
  git commit -m "Scaffold apps/subscriber package (tsconfig, vitest, boot stub)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 3: Stellar/Horizon wrapper with Zod-validated returns

**Files:**
- Create: `apps/subscriber/src/stellar.ts`
- Test: `apps/subscriber/src/stellar.test.ts`

**Interfaces:** Consumes Phase 0 `env` (`SOROBAN_RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`). Produces `getEvents(contractId, startLedger)` and `getContractPayments(contractAddr, hzCursor)` returning typed, validated records. (This is the thin getEvents wrapper called for in the interface contract, added in the subscriber because Phase 2 lives in `apps/web`.)

- [ ] **Step 1: Write failing test `apps/subscriber/src/stellar.test.ts`.**
  ```ts
  import { describe, it, expect, vi } from "vitest";

  const getEventsMock = vi.fn();
  vi.mock("@stellar/stellar-sdk", () => ({
    rpc: { Server: vi.fn(() => ({ getEvents: getEventsMock })) },
    Horizon: { Server: vi.fn(() => ({})) },
  }));

  import { decodeEventsResponse } from "./stellar";

  describe("decodeEventsResponse", () => {
    it("validates and maps a registered event", () => {
      const raw = {
        latestLedger: 105,
        events: [
          {
            type: "contract",
            ledger: 101,
            txHash: "abc123",
            topic: ["AAAA"], // registered topic symbol XDR
            value: "AAAB",   // (player, pool_after) XDR
          },
        ],
      };
      const decoded = decodeEventsResponse(raw);
      expect(decoded.latestLedger).toBe(105);
      expect(decoded.events[0]?.txHash).toBe("abc123");
      expect(decoded.events[0]?.ledger).toBe(101);
    });

    it("rejects a malformed response", () => {
      expect(() => decodeEventsResponse({ events: "nope" })).toThrow();
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/stellar.test.ts`.
  Expected: fails — `decodeEventsResponse` is not exported / file missing.
- [ ] **Step 3: Implement `apps/subscriber/src/stellar.ts`.**
  ```ts
  import { rpc, Horizon, scValToNative, xdr } from "@stellar/stellar-sdk";
  import { z } from "zod";
  import { env } from "./env";

  const eventSchema = z.object({
    type: z.string(),
    ledger: z.number().int(),
    txHash: z.string(),
    topic: z.array(z.string()),
    value: z.string(),
  });
  const eventsResponseSchema = z.object({
    latestLedger: z.number().int(),
    events: z.array(eventSchema),
  });
  export type DecodedEvents = z.infer<typeof eventsResponseSchema>;

  export function decodeEventsResponse(raw: unknown): DecodedEvents {
    return eventsResponseSchema.parse(raw);
  }

  /** Decode a base64 ScVal topic/value into a JS native via the SDK. */
  export function decodeScVal(b64: string): unknown {
    return scValToNative(xdr.ScVal.fromXDR(b64, "base64"));
  }

  const rpcServer = new rpc.Server(env.SOROBAN_RPC_URL, {
    allowHttp: env.SOROBAN_RPC_URL.startsWith("http://"),
  });
  const horizonServer = new Horizon.Server(env.HORIZON_URL, {
    allowHttp: env.HORIZON_URL.startsWith("http://"),
  });

  export async function getEvents(contractId: string, startLedger: number): Promise<DecodedEvents> {
    const res = await rpcServer.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [contractId] }],
    });
    return decodeEventsResponse(res);
  }

  const paymentSchema = z.object({
    id: z.string(),
    type: z.literal("payment"),
    transaction_hash: z.string(),
    paging_token: z.string(),
    from: z.string(),
    to: z.string(),
    amount: z.string(),
  });
  export type DecodedPayment = z.infer<typeof paymentSchema>;

  export async function getContractPayments(
    contractAddr: string,
    hzCursor: string | null,
  ): Promise<{ payments: (DecodedPayment & { memo: string | null })[]; nextCursor: string | null }> {
    let builder = horizonServer.payments().forAccount(contractAddr).order("asc").limit(50);
    if (hzCursor) builder = builder.cursor(hzCursor);
    const page = await builder.call();
    const out: (DecodedPayment & { memo: string | null })[] = [];
    let nextCursor = hzCursor;
    for (const record of page.records) {
      if (record.type !== "payment") continue;
      const payment = paymentSchema.parse(record);
      const tx = await (record as unknown as { transaction: () => Promise<{ memo?: string }> }).transaction();
      out.push({ ...payment, memo: tx.memo ?? null });
      nextCursor = payment.paging_token;
    }
    return { payments: out, nextCursor };
  }
  ```
  Also create `apps/subscriber/src/env.ts` (Zod env loader mirroring Phase 0's, refusing to boot on missing `DATABASE_URL`/`REDIS_URL`/`SOROBAN_RPC_URL`/`HORIZON_URL`/`NETWORK_PASSPHRASE`, plus `POLL_INTERVAL_MS` default `5000`).
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/stellar.test.ts`.
  Expected: `2 passed`.
- [ ] **Step 5: Commit.**
  ```bash
  git add apps/subscriber/src/stellar.ts apps/subscriber/src/stellar.test.ts apps/subscriber/src/env.ts
  git commit -m "Add Zod-validated Soroban getEvents + Horizon payments wrapper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 4: Per-contract ledger cursor

**Files:**
- Create: `apps/subscriber/src/cursor.ts`
- Create: `apps/subscriber/src/db.ts` (Prisma singleton importing the Phase 0 generated client)
- Test: `apps/subscriber/src/cursor.test.ts`

**Interfaces:** Consumes the `SubscriberCursor` model (Task 1) via `prisma`. Produces `getCursor(contractId)` / `setCursor(contractId, ledger, hzCursor?)`.

- [ ] **Step 1: Write failing test `apps/subscriber/src/cursor.test.ts`** (mock the Prisma singleton; assert default + persistence + recovery).
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const store = new Map<string, { contractId: string; ledger: number; hzCursor: string | null }>();
  vi.mock("./db", () => ({
    prisma: {
      subscriberCursor: {
        findUnique: vi.fn(async ({ where }: any) => store.get(where.contractId) ?? null),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const prev = store.get(where.contractId);
          const next = prev ? { ...prev, ...update } : create;
          store.set(where.contractId, next);
          return next;
        }),
      },
    },
  }));

  import { getCursor, setCursor } from "./cursor";

  beforeEach(() => store.clear());

  describe("cursor", () => {
    it("returns ledger 0 / null when no cursor exists", async () => {
      const c = await getCursor("CABC");
      expect(c).toEqual({ ledger: 0, hzCursor: null });
    });

    it("persists and recovers a cursor across reads (restart simulation)", async () => {
      await setCursor("CABC", 142, "tok-9");
      const recovered = await getCursor("CABC");
      expect(recovered).toEqual({ ledger: 142, hzCursor: "tok-9" });
    });

    it("advances only the ledger, preserving hzCursor", async () => {
      await setCursor("CABC", 142, "tok-9");
      await setCursor("CABC", 200);
      const c = await getCursor("CABC");
      expect(c.ledger).toBe(200);
      expect(c.hzCursor).toBe("tok-9");
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/cursor.test.ts`.
  Expected: fails — `cursor.ts` missing.
- [ ] **Step 3: Implement `apps/subscriber/src/db.ts` and `apps/subscriber/src/cursor.ts`.**
  ```ts
  // db.ts
  import { PrismaClient } from "@prisma/client";
  const g = globalThis as unknown as { prisma?: PrismaClient };
  export const prisma = g.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") g.prisma = prisma;
  ```
  ```ts
  // cursor.ts
  import { prisma } from "./db";

  export interface Cursor { ledger: number; hzCursor: string | null }

  export async function getCursor(contractId: string): Promise<Cursor> {
    const row = await prisma.subscriberCursor.findUnique({ where: { contractId } });
    return row ? { ledger: row.ledger, hzCursor: row.hzCursor } : { ledger: 0, hzCursor: null };
  }

  export async function setCursor(contractId: string, ledger: number, hzCursor?: string): Promise<void> {
    const update = hzCursor === undefined ? { ledger } : { ledger, hzCursor };
    await prisma.subscriberCursor.upsert({
      where: { contractId },
      create: { contractId, ledger, hzCursor: hzCursor ?? null },
      update,
    });
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/cursor.test.ts`.
  Expected: `3 passed` (default, persistence/recovery, partial advance).
- [ ] **Step 5: Commit.**
  ```bash
  git add apps/subscriber/src/db.ts apps/subscriber/src/cursor.ts apps/subscriber/src/cursor.test.ts
  git commit -m "Add per-contract ledger cursor with restart recovery

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 5: Idempotent event reconciliation (registered / finalized / cancelled)

**Files:**
- Create: `apps/subscriber/src/reconcile.ts`
- Test: `apps/subscriber/src/reconcile.test.ts`

**Interfaces:** Consumes `prisma` models `ContractEvent{type:EventType,ledger?,txHash?,payload:Json}`/`Participant`/`Payout`/`Tournament`. Produces `applyEvent(tournament, decodedEvent)` returning the change payload `{ type, txHash, data }` or `null` when the event is a duplicate (idempotency).

- [ ] **Step 1: Write failing test `apps/subscriber/src/reconcile.test.ts`** — mock `prisma`; feed a `registered` event; assert a `ContractEvent` row + `Participant` upsert; then **replay the same event** and assert NO second write (idempotency on `txHash`). Cover `finalized` (3 `Payout` rows + `Tournament.status=FINISHED` + `finalizedAt`) and `cancelled` (`status=CANCELLED` + `cancelledAt`).
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const events: any[] = [];
  const participants: any[] = [];
  const payouts: any[] = [];
  const tournaments: Record<string, any> = { t1: { id: "t1", status: "ACTIVE" } };

  vi.mock("./db", () => ({
    prisma: {
      $transaction: vi.fn(async (fn: any) => fn(txClient)),
    },
  }));

  const txClient = {
    contractEvent: {
      findUnique: vi.fn(async ({ where }: any) =>
        events.find((e) => e.txHash === where.txHash_type?.txHash && e.type === where.txHash_type?.type) ?? null),
      create: vi.fn(async ({ data }: any) => { events.push(data); return data; }),
    },
    participant: {
      upsert: vi.fn(async ({ create }: any) => { participants.push(create); return create; }),
    },
    payout: { create: vi.fn(async ({ data }: any) => { payouts.push(data); return data; }) },
    tournament: {
      update: vi.fn(async ({ where, data }: any) => { Object.assign(tournaments[where.id], data); return tournaments[where.id]; }),
    },
  };

  import { applyEvent } from "./reconcile";

  const tournament = { id: "t1", contractId: "CABC", firstBps: 6000, secondBps: 3000, thirdBps: 1000 } as any;

  beforeEach(() => { events.length = 0; participants.length = 0; payouts.length = 0; });

  describe("applyEvent", () => {
    it("ingests a registered event → ContractEvent + Participant", async () => {
      const change = await applyEvent(tournament, {
        type: "REGISTERED", ledger: 10, txHash: "tx-reg-1",
        data: { player: "GPLAYER1", poolAfter: "10000000" },
      });
      expect(events).toHaveLength(1);
      expect(participants).toHaveLength(1);
      expect(participants[0].playerAddr).toBe("GPLAYER1");
      expect(change).toEqual({ type: "REGISTERED", txHash: "tx-reg-1", data: { player: "GPLAYER1", poolAfter: "10000000" } });
    });

    it("is idempotent on replay (same txHash → no second write, returns null)", async () => {
      const evt = { type: "REGISTERED" as const, ledger: 10, txHash: "tx-reg-1",
        data: { player: "GPLAYER1", poolAfter: "10000000" } };
      await applyEvent(tournament, evt);
      const second = await applyEvent(tournament, evt);
      expect(events).toHaveLength(1);
      expect(participants).toHaveLength(1);
      expect(second).toBeNull();
    });

    it("ingests a finalized event → 3 Payout rows + FINISHED", async () => {
      await applyEvent(tournament, {
        type: "FINALIZED", ledger: 20, txHash: "tx-fin-1",
        data: { first: "GA", second: "GB", third: "GC", amounts: ["6000000", "3000000", "1000000"] },
      });
      expect(payouts).toHaveLength(3);
      expect(payouts[0]).toMatchObject({ rank: 1, playerAddr: "GA", amount: 6000000n });
      expect(tournaments.t1.status).toBe("FINISHED");
      expect(tournaments.t1.finalizedAt).toBeInstanceOf(Date);
    });

    it("ingests a cancelled event → CANCELLED", async () => {
      await applyEvent(tournament, { type: "CANCELLED", ledger: 30, txHash: "tx-can-1", data: { refundedCount: 4 } });
      expect(tournaments.t1.status).toBe("CANCELLED");
      expect(tournaments.t1.cancelledAt).toBeInstanceOf(Date);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/reconcile.test.ts`.
  Expected: fails — `reconcile.ts` missing.
- [ ] **Step 3: Implement `apps/subscriber/src/reconcile.ts`.**
  ```ts
  import { prisma } from "./db";

  export type EventType = "REGISTERED" | "FINALIZED" | "CANCELLED";

  export interface DecodedEvent {
    type: EventType;
    ledger: number;
    txHash: string;
    data: Record<string, unknown>;
  }

  export interface Change { type: EventType; txHash: string; data: Record<string, unknown> }

  export async function applyEvent(
    tournament: { id: string; contractId: string },
    evt: DecodedEvent,
  ): Promise<Change | null> {
    return prisma.$transaction(async (tx) => {
      // Idempotency: dedupe on (txHash, type).
      const existing = await tx.contractEvent.findUnique({
        where: { txHash_type: { txHash: evt.txHash, type: evt.type } },
      });
      if (existing) return null;

      await tx.contractEvent.create({
        data: {
          tournamentId: tournament.id,
          type: evt.type,
          ledger: evt.ledger,
          txHash: evt.txHash,
          payload: evt.data,
        },
      });

      if (evt.type === "REGISTERED") {
        const player = String(evt.data.player);
        await tx.participant.upsert({
          where: { tournamentId_playerAddr: { tournamentId: tournament.id, playerAddr: player } },
          create: { tournamentId: tournament.id, playerAddr: player, joinTxHash: evt.txHash },
          update: { joinTxHash: evt.txHash },
        });
      } else if (evt.type === "FINALIZED") {
        const winners = [evt.data.first, evt.data.second, evt.data.third].map(String);
        const amounts = (evt.data.amounts as string[]).map((a) => BigInt(a));
        for (let i = 0; i < 3; i++) {
          await tx.payout.create({
            data: {
              tournamentId: tournament.id,
              rank: i + 1,
              playerAddr: winners[i]!,
              amount: amounts[i]!,
              txHash: evt.txHash,
            },
          });
        }
        await tx.tournament.update({
          where: { id: tournament.id },
          data: { status: "FINISHED", finalizedAt: new Date() },
        });
      } else {
        await tx.tournament.update({
          where: { id: tournament.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
      }

      return { type: evt.type, txHash: evt.txHash, data: evt.data };
    });
  }
  ```
  This requires a compound unique on `ContractEvent` for the dedupe lookup. Add `@@unique([txHash, type], name: "txHash_type")` to the `ContractEvent` model and a `@@unique([tournamentId, playerAddr], name: "tournamentId_playerAddr")` is already present on `Participant` (SPEC §10). Ship this as a follow-on migration `add_contractevent_txhash_unique` (run `pnpm --filter web prisma migrate dev --name add_contractevent_txhash_unique` before this step's PASS run).
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/reconcile.test.ts`.
  Expected: `4 passed` — including the replay/idempotency case showing one write only.
- [ ] **Step 5: Commit.**
  ```bash
  git add apps/subscriber/src/reconcile.ts apps/subscriber/src/reconcile.test.ts apps/web/prisma/schema.prisma apps/web/prisma/migrations
  git commit -m "Add idempotent event reconciliation (registered/finalized/cancelled) deduped on txHash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 6: Horizon SEP-7 deposit reconciliation

**Files:**
- Create: `apps/subscriber/src/horizon-sep7.ts`
- Test: `apps/subscriber/src/horizon-sep7.test.ts`

**Interfaces:** Consumes `getContractPayments` (Task 3) + `prisma` `Participant`/`ContractEvent` + cursor's `hzCursor`. Produces `reconcileSep7Deposits(tournament, hzCursor)` → `{ changes: Change[]; nextCursor: string | null }`. Treats deposits as untrusted: only payments with `memo == tournamentId` and `to == contractAddr` become a registration.

- [ ] **Step 1: Write failing test `apps/subscriber/src/horizon-sep7.test.ts`** — mock `getContractPayments` to return one matching payment (`memo == tournamentId`) and one non-matching (wrong memo); assert only the matching one yields a `Participant` upsert + a `REGISTERED` `ContractEvent`; replay → idempotent (dedupe on the payment's `transaction_hash`).
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const getContractPayments = vi.fn();
  vi.mock("./stellar", () => ({ getContractPayments }));

  const applyEvent = vi.fn(async (_t: any, e: any) => ({ type: e.type, txHash: e.txHash, data: e.data }));
  vi.mock("./reconcile", () => ({ applyEvent }));

  import { reconcileSep7Deposits } from "./horizon-sep7";

  const tournament = { id: "t1", contractId: "CABC" } as any;

  beforeEach(() => { getContractPayments.mockReset(); applyEvent.mockReset(); applyEvent.mockImplementation(async (_t, e) => ({ type: e.type, txHash: e.txHash, data: e.data })); });

  describe("reconcileSep7Deposits", () => {
    it("reconciles only the deposit whose memo == tournamentId", async () => {
      getContractPayments.mockResolvedValue({
        payments: [
          { transaction_hash: "tx-dep-1", from: "GDEPOSITOR", to: "CABC", amount: "10000000", memo: "t1", paging_token: "p1" },
          { transaction_hash: "tx-dep-2", from: "GOTHER", to: "CABC", amount: "10000000", memo: "WRONG", paging_token: "p2" },
        ],
        nextCursor: "p2",
      });
      const { changes, nextCursor } = await reconcileSep7Deposits(tournament, null);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ type: "REGISTERED", txHash: "tx-dep-1" });
      expect(applyEvent).toHaveBeenCalledTimes(1);
      expect(applyEvent.mock.calls[0][1]).toMatchObject({ type: "REGISTERED", txHash: "tx-dep-1", data: { player: "GDEPOSITOR" } });
      expect(nextCursor).toBe("p2");
    });

    it("is idempotent — applyEvent returning null (already seen) drops the change", async () => {
      applyEvent.mockResolvedValueOnce(null);
      getContractPayments.mockResolvedValue({
        payments: [{ transaction_hash: "tx-dep-1", from: "GDEPOSITOR", to: "CABC", amount: "10000000", memo: "t1", paging_token: "p1" }],
        nextCursor: "p1",
      });
      const { changes } = await reconcileSep7Deposits(tournament, null);
      expect(changes).toHaveLength(0);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/horizon-sep7.test.ts`.
  Expected: fails — `horizon-sep7.ts` missing.
- [ ] **Step 3: Implement `apps/subscriber/src/horizon-sep7.ts`.**
  ```ts
  import { getContractPayments } from "./stellar";
  import { applyEvent, type Change } from "./reconcile";

  export async function reconcileSep7Deposits(
    tournament: { id: string; contractId: string },
    hzCursor: string | null,
  ): Promise<{ changes: Change[]; nextCursor: string | null }> {
    const { payments, nextCursor } = await getContractPayments(tournament.contractId, hzCursor);
    const changes: Change[] = [];
    for (const p of payments) {
      // Untrusted until reconciled: require exact memo + destination match.
      if (p.memo !== tournament.id) continue;
      if (p.to !== tournament.contractId) continue;
      const change = await applyEvent(tournament, {
        type: "REGISTERED",
        ledger: 0,
        txHash: p.transaction_hash,
        data: { player: p.from, poolAfter: null, source: "sep7", amount: p.amount },
      });
      if (change) changes.push(change);
    }
    return { changes, nextCursor };
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/horizon-sep7.test.ts`.
  Expected: `2 passed`.
- [ ] **Step 5: Commit.**
  ```bash
  git add apps/subscriber/src/horizon-sep7.ts apps/subscriber/src/horizon-sep7.test.ts
  git commit -m "Reconcile SEP-7 deposits (memo==tournamentId) into registrations, idempotently

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 7: Redis publish + poller orchestration

**Files:**
- Create: `apps/subscriber/src/redis.ts` (ioredis singleton from `env.REDIS_URL`)
- Create: `apps/subscriber/src/publish.ts`
- Create: `apps/subscriber/src/poller.ts`
- Test: `apps/subscriber/src/publish.test.ts`
- Test: `apps/subscriber/src/poller.test.ts`

**Interfaces:** Consumes Task 3 `getEvents` + a topic→`EventType` decoder, Task 5 `applyEvent`, Task 6 `reconcileSep7Deposits`, Task 4 cursor. Produces `publishChange(tournamentId, payload)` to Redis `tournament:<id>` and `pollTournament(tournament)`.

- [ ] **Step 1: Write failing test `apps/subscriber/src/publish.test.ts`.**
  ```ts
  import { describe, it, expect, vi } from "vitest";
  const publish = vi.fn(async () => 1);
  vi.mock("./redis", () => ({ redis: { publish } }));
  import { publishChange } from "./publish";

  describe("publishChange", () => {
    it("publishes JSON to channel tournament:<id>", async () => {
      await publishChange("t1", { type: "REGISTERED", txHash: "tx1", data: { player: "GA" } });
      expect(publish).toHaveBeenCalledWith(
        "tournament:t1",
        JSON.stringify({ type: "REGISTERED", txHash: "tx1", data: { player: "GA" } }),
      );
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/publish.test.ts`. Expected: fails — missing file.
- [ ] **Step 3: Implement `redis.ts` + `publish.ts`.**
  ```ts
  // redis.ts
  import Redis from "ioredis";
  import { env } from "./env";
  export const redis = new Redis(env.REDIS_URL);
  ```
  ```ts
  // publish.ts
  import { redis } from "./redis";
  import type { Change } from "./reconcile";
  export const channelFor = (tournamentId: string): string => `tournament:${tournamentId}`;
  export async function publishChange(tournamentId: string, payload: Change): Promise<void> {
    await redis.publish(channelFor(tournamentId), JSON.stringify(payload));
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/publish.test.ts`. Expected: `1 passed`.
- [ ] **Step 5: Write failing test `apps/subscriber/src/poller.test.ts`** — mock `getEvents` to return a `registered` event, mock cursor/applyEvent/sep7/publish; assert it decodes the topic, calls `applyEvent`, publishes the change, and advances the cursor to `latestLedger + 1`.
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const getEvents = vi.fn();
  const decodeScVal = vi.fn();
  vi.mock("./stellar", () => ({ getEvents, decodeScVal, getContractPayments: vi.fn() }));

  const getCursor = vi.fn(); const setCursor = vi.fn();
  vi.mock("./cursor", () => ({ getCursor, setCursor }));

  const applyEvent = vi.fn();
  vi.mock("./reconcile", () => ({ applyEvent }));

  const reconcileSep7Deposits = vi.fn(async () => ({ changes: [], nextCursor: "p1" }));
  vi.mock("./horizon-sep7", () => ({ reconcileSep7Deposits }));

  const publishChange = vi.fn();
  vi.mock("./publish", () => ({ publishChange }));

  import { pollTournament } from "./poller";

  const tournament = { id: "t1", contractId: "CABC" } as any;

  beforeEach(() => {
    getCursor.mockResolvedValue({ ledger: 100, hzCursor: null });
    getEvents.mockResolvedValue({
      latestLedger: 110,
      events: [{ type: "contract", ledger: 105, txHash: "tx-reg-1", topic: ["REG"], value: "VAL" }],
    });
    // topic[0] decodes to the "registered" symbol; value decodes to [player, pool_after]
    decodeScVal.mockImplementation((b64: string) => (b64 === "REG" ? "registered" : ["GPLAYER1", 10000000n]));
    applyEvent.mockResolvedValue({ type: "REGISTERED", txHash: "tx-reg-1", data: { player: "GPLAYER1", poolAfter: "10000000" } });
  });

  describe("pollTournament", () => {
    it("ingests a registered event, publishes it, and advances the cursor", async () => {
      await pollTournament(tournament);
      expect(applyEvent).toHaveBeenCalledTimes(1);
      expect(applyEvent.mock.calls[0][1]).toMatchObject({ type: "REGISTERED", txHash: "tx-reg-1", ledger: 105 });
      expect(publishChange).toHaveBeenCalledWith("t1", expect.objectContaining({ type: "REGISTERED", txHash: "tx-reg-1" }));
      expect(setCursor).toHaveBeenCalledWith("CABC", 111, "p1"); // latestLedger + 1, hz cursor advanced
    });

    it("does not publish a duplicate (applyEvent returns null on replay)", async () => {
      applyEvent.mockResolvedValue(null);
      await pollTournament(tournament);
      expect(publishChange).not.toHaveBeenCalled();
      expect(setCursor).toHaveBeenCalledWith("CABC", 111, "p1");
    });
  });
  ```
- [ ] **Step 6: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/poller.test.ts`. Expected: fails — missing file.
- [ ] **Step 7: Implement `apps/subscriber/src/poller.ts`.**
  ```ts
  import { getEvents, decodeScVal } from "./stellar";
  import { getCursor, setCursor } from "./cursor";
  import { applyEvent, type DecodedEvent, type EventType, type Change } from "./reconcile";
  import { reconcileSep7Deposits } from "./horizon-sep7";
  import { publishChange } from "./publish";

  const TOPIC_TO_TYPE: Record<string, EventType> = {
    registered: "REGISTERED",
    finalized: "FINALIZED",
    cancelled: "CANCELLED",
  };

  function decodeEvent(raw: { ledger: number; txHash: string; topic: string[]; value: string }): DecodedEvent | null {
    const symbol = String(decodeScVal(raw.topic[0]!));
    const type = TOPIC_TO_TYPE[symbol];
    if (!type) return null;
    const value = decodeScVal(raw.value) as unknown;
    let data: Record<string, unknown>;
    if (type === "REGISTERED") {
      const [player, poolAfter] = value as [string, bigint];
      data = { player, poolAfter: poolAfter.toString() };
    } else if (type === "FINALIZED") {
      const [first, second, third, amounts] = value as [string, string, string, bigint[]];
      data = { first, second, third, amounts: amounts.map((a) => a.toString()) };
    } else {
      const refundedCount = Number(value as bigint | number);
      data = { refundedCount };
    }
    return { type, ledger: raw.ledger, txHash: raw.txHash, data };
  }

  export async function pollTournament(tournament: { id: string; contractId: string }): Promise<Change[]> {
    const cursor = await getCursor(tournament.contractId);
    const changes: Change[] = [];

    const res = await getEvents(tournament.contractId, cursor.ledger + 1);
    for (const raw of res.events) {
      const decoded = decodeEvent(raw);
      if (!decoded) continue;
      const change = await applyEvent(tournament, decoded);
      if (change) {
        await publishChange(tournament.id, change);
        changes.push(change);
      }
    }

    const sep7 = await reconcileSep7Deposits(tournament, cursor.hzCursor);
    for (const change of sep7.changes) {
      await publishChange(tournament.id, change);
      changes.push(change);
    }

    // Advance both cursors together (at-least-once: only after successful ingest+publish).
    await setCursor(tournament.contractId, res.latestLedger + 1, sep7.nextCursor ?? undefined);
    return changes;
  }
  ```
- [ ] **Step 8: Run, expect PASS.** `pnpm --filter subscriber vitest run src/poller.test.ts`. Expected: `2 passed`.
- [ ] **Step 9: Commit.**
  ```bash
  git add apps/subscriber/src/redis.ts apps/subscriber/src/publish.ts apps/subscriber/src/poller.ts apps/subscriber/src/publish.test.ts apps/subscriber/src/poller.test.ts
  git commit -m "Add Redis publish + pollTournament orchestration (events + SEP-7 + cursor advance)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 8: Service loop (`index.ts`) + graceful shutdown

**Files:**
- Modify: `apps/subscriber/src/index.ts`
- Test: `apps/subscriber/src/index.test.ts`

**Interfaces:** Consumes `prisma` (load `ACTIVE` tournaments), `pollTournament`, `env.POLL_INTERVAL_MS`. Produces the long-running worker entrypoint.

- [ ] **Step 1: Write failing test `apps/subscriber/src/index.test.ts`** — export a single `tick()` from `index.ts`; mock `prisma.tournament.findMany` to return two ACTIVE tournaments with a `contractId`; mock `pollTournament`; assert `tick()` polls each once and swallows a per-tournament error without throwing.
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const findMany = vi.fn();
  vi.mock("./db", () => ({ prisma: { tournament: { findMany } } }));
  const pollTournament = vi.fn();
  vi.mock("./poller", () => ({ pollTournament }));

  import { tick } from "./index";

  beforeEach(() => { findMany.mockReset(); pollTournament.mockReset(); });

  describe("tick", () => {
    it("polls every ACTIVE tournament with a contractId", async () => {
      findMany.mockResolvedValue([{ id: "t1", contractId: "C1" }, { id: "t2", contractId: "C2" }]);
      pollTournament.mockResolvedValue([]);
      await tick();
      expect(pollTournament).toHaveBeenCalledTimes(2);
      expect(findMany).toHaveBeenCalledWith({
        where: { status: "ACTIVE", contractId: { not: null } },
        select: { id: true, contractId: true },
      });
    });

    it("isolates a failing tournament (one throws, the other still polls)", async () => {
      findMany.mockResolvedValue([{ id: "t1", contractId: "C1" }, { id: "t2", contractId: "C2" }]);
      pollTournament.mockRejectedValueOnce(new Error("rpc down")).mockResolvedValueOnce([]);
      await expect(tick()).resolves.toBeUndefined();
      expect(pollTournament).toHaveBeenCalledTimes(2);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter subscriber vitest run src/index.test.ts`. Expected: fails — `tick` not exported.
- [ ] **Step 3: Implement `apps/subscriber/src/index.ts`.**
  ```ts
  import { prisma } from "./db";
  import { pollTournament } from "./poller";
  import { env } from "./env";

  export async function tick(): Promise<void> {
    const tournaments = await prisma.tournament.findMany({
      where: { status: "ACTIVE", contractId: { not: null } },
      select: { id: true, contractId: true },
    });
    for (const t of tournaments) {
      if (!t.contractId) continue;
      try {
        await pollTournament({ id: t.id, contractId: t.contractId });
      } catch (err) {
        console.error(`[subscriber] poll failed for ${t.id}`, err);
      }
    }
  }

  async function main(): Promise<void> {
    let running = true;
    const stop = () => { running = false; };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    console.log("[subscriber] started");
    while (running) {
      await tick();
      await new Promise((r) => setTimeout(r, env.POLL_INTERVAL_MS));
    }
    await prisma.$disconnect();
    console.log("[subscriber] stopped");
  }

  // Only run the loop when executed directly (not when imported by tests).
  if (process.env.VITEST === undefined) {
    main().catch((err) => { console.error("[subscriber] fatal", err); process.exit(1); });
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter subscriber vitest run src/index.test.ts`. Expected: `2 passed`.
- [ ] **Step 5: Full subscriber suite + typecheck.** Run `pnpm --filter subscriber vitest run && pnpm --filter subscriber exec tsc --noEmit`.
  Expected: all subscriber tests pass; `tsc` exits 0.
- [ ] **Step 6: Commit.**
  ```bash
  git add apps/subscriber/src/index.ts apps/subscriber/src/index.test.ts
  git commit -m "Add subscriber poll loop with per-tournament error isolation + graceful shutdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 9: SSE route handler `GET /api/tournaments/[id]/events`

**Files:**
- Create: `apps/web/src/app/api/tournaments/[id]/events/route.ts`
- Test: `apps/web/src/app/api/tournaments/[id]/events/route.test.ts`

**Interfaces:** Consumes Phase 0 `prisma` (`@/lib/db`) to replay recent `ContractEvent` rows, the redis singleton (`@/lib/redis`) to subscribe to `tournament:<id>`, and the channel name format from `publish.ts`. Produces a `text/event-stream` response. Polling fallback via `?fallback=poll`.

- [ ] **Step 1: Write failing test `route.test.ts`** — mock a redis subscriber whose `on("message")` handler we capture; mock `prisma.contractEvent.findMany` (recent rows). Call `GET`, read the first chunks of the `ReadableStream`, assert: (a) replayed rows emit `data:` frames, (b) a simulated published message emits a new `data:` frame with the payload, (c) `Content-Type` is `text/event-stream`.
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  let messageHandler: ((channel: string, msg: string) => void) | undefined;
  const subscribe = vi.fn(async () => {});
  const on = vi.fn((evt: string, cb: any) => { if (evt === "message") messageHandler = cb; });
  const quit = vi.fn(async () => {});
  const duplicate = vi.fn(() => ({ subscribe, on, quit, unsubscribe: vi.fn() }));

  vi.mock("@/lib/redis", () => ({ redis: { duplicate } }));
  vi.mock("@/lib/db", () => ({
    prisma: {
      contractEvent: {
        findMany: vi.fn(async () => [
          { type: "REGISTERED", txHash: "tx-old", payload: { player: "GA", poolAfter: "10000000" } },
        ]),
      },
    },
  }));

  import { GET } from "./route";

  async function readFrames(res: Response, count: number): Promise<string> {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let out = "";
    while ((out.match(/data:/g)?.length ?? 0) < count) {
      const { value, done } = await reader.read();
      if (done) break;
      out += dec.decode(value);
    }
    await reader.cancel();
    return out;
  }

  beforeEach(() => { messageHandler = undefined; });

  describe("GET /api/tournaments/[id]/events (SSE)", () => {
    it("streams replayed rows then live published messages as data frames", async () => {
      const req = new Request("http://x/api/tournaments/t1/events");
      const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(subscribe).toHaveBeenCalledWith("tournament:t1");

      // live message
      messageHandler?.("tournament:t1", JSON.stringify({ type: "FINALIZED", txHash: "tx-new", data: { first: "GA" } }));
      const frames = await readFrames(res, 2);
      expect(frames).toContain("tx-old");   // replay
      expect(frames).toContain("tx-new");   // live
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter web vitest run src/app/api/tournaments/\[id\]/events/route.test.ts`. Expected: fails — route missing.
- [ ] **Step 3: Implement `route.ts`.**
  ```ts
  import { prisma } from "@/lib/db";
  import { redis } from "@/lib/redis";

  export const dynamic = "force-dynamic";

  const channelFor = (id: string) => `tournament:${id}`;
  const sseFrame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

  export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const { id } = await params;
    const url = new URL(req.url);

    // Polling fallback: return the recent rows as JSON, no stream.
    if (url.searchParams.get("fallback") === "poll") {
      const rows = await prisma.contractEvent.findMany({
        where: { tournamentId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return Response.json({ ok: true, data: rows.reverse() });
    }

    const sub = redis.duplicate();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Replay recent confirmed events (Redis is not the source of truth).
        const recent = await prisma.contractEvent.findMany({
          where: { tournamentId: id },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        for (const ev of recent) {
          controller.enqueue(encoder.encode(sseFrame({ type: ev.type, txHash: ev.txHash, data: ev.payload })));
        }
        controller.enqueue(encoder.encode(": connected\n\n"));

        sub.on("message", (_channel, message) => {
          try {
            controller.enqueue(encoder.encode(sseFrame(JSON.parse(message))));
          } catch {
            /* drop malformed */
          }
        });
        await sub.subscribe(channelFor(id));

        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 25_000);

        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          void sub.unsubscribe(channelFor(id));
          void sub.quit();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter web vitest run src/app/api/tournaments/\[id\]/events/route.test.ts`. Expected: `1 passed` — replay + live frames present.
- [ ] **Step 5: Commit.**
  ```bash
  git add "apps/web/src/app/api/tournaments/[id]/events"
  git commit -m "Add SSE route handler streaming Redis tournament channel with DB replay + poll fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 10: Wire `<PrizePoolCounter>` to the SSE stream (live tick-up)

**Files:**
- Modify: `apps/web/src/components/prize-pool-counter.tsx`
- Create: `apps/web/src/hooks/use-tournament-events.ts` (shared EventSource hook with reconnect)
- Test: `apps/web/src/hooks/use-tournament-events.test.ts`

**Interfaces:** Consumes the SSE endpoint from Task 9 + Phase 4 `GET /api/tournaments/[id]` (initial pool snapshot). Produces a live-updating counter that pops `scale(1.05)` on increase (BRAND §6 "Live counter"), reduced-motion aware.

- [ ] **Step 1: Write failing test `use-tournament-events.test.ts`** — stub a fake `EventSource` on `globalThis`; mount the hook (via `@testing-library/react renderHook`); dispatch a `message` event with a `REGISTERED` payload; assert the hook surfaces the parsed event; dispatch `error` and assert it schedules a reconnect (a new `EventSource` constructed).
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { renderHook, act, waitFor } from "@testing-library/react";

  class FakeES {
    static instances: FakeES[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    url: string;
    closed = false;
    constructor(url: string) { this.url = url; FakeES.instances.push(this); }
    close() { this.closed = true; }
    emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
  }

  beforeEach(() => { FakeES.instances = []; (globalThis as any).EventSource = FakeES as any; vi.useFakeTimers(); });

  import { useTournamentEvents } from "./use-tournament-events";

  describe("useTournamentEvents", () => {
    it("parses incoming SSE messages", async () => {
      const { result } = renderHook(() => useTournamentEvents("t1"));
      act(() => FakeES.instances[0]!.emit({ type: "REGISTERED", txHash: "tx1", data: { player: "GA" } }));
      await waitFor(() => expect(result.current.events.at(-1)).toMatchObject({ type: "REGISTERED", txHash: "tx1" }));
    });

    it("reconnects on error", async () => {
      renderHook(() => useTournamentEvents("t1"));
      act(() => { FakeES.instances[0]!.onerror?.(new Event("error")); vi.advanceTimersByTime(3000); });
      expect(FakeES.instances.length).toBe(2);
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter web vitest run src/hooks/use-tournament-events.test.ts`. Expected: fails — hook missing.
- [ ] **Step 3: Implement `use-tournament-events.ts`.**
  ```ts
  "use client";
  import { useEffect, useRef, useState, useCallback } from "react";

  export interface LiveEvent { type: "REGISTERED" | "FINALIZED" | "CANCELLED"; txHash: string | null; data: Record<string, unknown> }

  export function useTournamentEvents(tournamentId: string): { events: LiveEvent[] } {
    const [events, setEvents] = useState<LiveEvent[]>([]);
    const esRef = useRef<EventSource | null>(null);
    const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
      const es = new EventSource(`/api/tournaments/${tournamentId}/events`);
      esRef.current = es;
      es.onmessage = (e) => {
        try { setEvents((prev) => [...prev, JSON.parse(e.data) as LiveEvent]); } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        retry.current = setTimeout(connect, 3000);
      };
    }, [tournamentId]);

    useEffect(() => {
      connect();
      return () => { esRef.current?.close(); if (retry.current) clearTimeout(retry.current); };
    }, [connect]);

    return { events };
  }
  ```
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter web vitest run src/hooks/use-tournament-events.test.ts`. Expected: `2 passed`.
- [ ] **Step 5: Wire `<PrizePoolCounter>` to the hook.** Modify `apps/web/src/components/prize-pool-counter.tsx`: derive the pool from the initial `GET /api/tournaments/[id]` snapshot plus every `REGISTERED` event's `poolAfter` (or `+= entryFee` for SEP-7 deposits without `poolAfter`); when the displayed pool increases, apply a `scale(1.05)` pop unless `window.matchMedia("(prefers-reduced-motion: reduce)").matches`. Render the number in `headline-xl` acid-yellow with a small dim `XLM` unit (BRAND §3). Amounts handled as `BigInt`, formatted to a decimal XLM string for display only.
  ```tsx
  "use client";
  import { useEffect, useRef, useState } from "react";
  import { useTournamentEvents } from "@/hooks/use-tournament-events";

  function stroopsToXlm(stroops: bigint): string {
    const whole = stroops / 10_000_000n;
    const frac = (stroops % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : `${whole}`;
  }

  export function PrizePoolCounter({ tournamentId, initialPool, entryFee }: { tournamentId: string; initialPool: string; entryFee: string }) {
    const { events } = useTournamentEvents(tournamentId);
    const [pool, setPool] = useState<bigint>(BigInt(initialPool));
    const [pop, setPop] = useState(false);
    const seen = useRef(0);
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    useEffect(() => {
      let next = pool;
      for (let i = seen.current; i < events.length; i++) {
        const ev = events[i]!;
        if (ev.type !== "REGISTERED") continue;
        const after = ev.data.poolAfter;
        next = typeof after === "string" ? BigInt(after) : next + BigInt(entryFee);
      }
      seen.current = events.length;
      if (next > pool) {
        setPool(next);
        if (!reduced) { setPop(true); setTimeout(() => setPop(false), 200); }
      }
    }, [events, entryFee, pool, reduced]);

    return (
      <div className="high-contrast-card acid-glow p-8" aria-live="polite">
        <span
          className="font-display text-acid-yellow text-[clamp(48px,12vw,160px)] font-extrabold transition-transform duration-200"
          style={{ transform: pop ? "scale(1.05)" : "scale(1)" }}
        >
          {stroopsToXlm(pool)}
        </span>
        <span className="font-mono text-on-surface-variant ml-2 text-lg">XLM</span>
      </div>
    );
  }
  ```
- [ ] **Step 6: Typecheck + lint the component.** Run `pnpm --filter web exec tsc --noEmit`.
  Expected: exits 0.
- [ ] **Step 7: Commit.**
  ```bash
  git add apps/web/src/hooks/use-tournament-events.ts apps/web/src/hooks/use-tournament-events.test.ts apps/web/src/components/prize-pool-counter.tsx
  git commit -m "Wire PrizePoolCounter to SSE with live tick-up + reduced-motion guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 11: Wire `<LiveFeed>` to the SSE stream (ticker)

**Files:**
- Modify: `apps/web/src/components/live-feed.tsx`
- Test: `apps/web/src/components/live-feed.test.tsx`

**Interfaces:** Consumes `useTournamentEvents` (Task 10). Produces the registration/finalisation tx ticker (BRAND §6 `ticker-scroll`, §5 LIVE badge + pulsing dot), reduced-motion aware, with human-readable gloss per BRAND §8 ("Player GA…X9 joined — pool now Y XLM").

- [ ] **Step 1: Write failing test `live-feed.test.tsx`** — stub the `useTournamentEvents` hook to return one `REGISTERED` and one `FINALIZED` event; render `<LiveFeed tournamentId="t1"/>`; assert both rows render with their human-readable gloss and the truncated mono address; assert the ticker animation class is absent when `prefers-reduced-motion` is mocked to `reduce`.
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";

  vi.mock("@/hooks/use-tournament-events", () => ({
    useTournamentEvents: () => ({
      events: [
        { type: "REGISTERED", txHash: "tx1", data: { player: "GABCDEFGHIJKLMNOP", poolAfter: "20000000" } },
        { type: "FINALIZED", txHash: "tx2", data: { first: "GA", second: "GB", third: "GC", amounts: ["12", "6", "2"] } },
      ],
    }),
  }));

  beforeEach(() => {
    (globalThis as any).matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  import { LiveFeed } from "./live-feed";

  describe("LiveFeed", () => {
    it("renders registration + finalisation rows with gloss", () => {
      render(<LiveFeed tournamentId="t1" />);
      expect(screen.getByText(/joined/i)).toBeTruthy();
      expect(screen.getByText(/Payouts sent/i)).toBeTruthy();
      expect(screen.getByText(/GABCD…MNOP/)).toBeTruthy(); // truncated mono addr
    });

    it("omits ticker-scroll animation under prefers-reduced-motion", () => {
      const { container } = render(<LiveFeed tournamentId="t1" />);
      expect(container.querySelector(".animate-ticker-scroll")).toBeNull();
    });
  });
  ```
- [ ] **Step 2: Run, expect FAIL.** `pnpm --filter web vitest run src/components/live-feed.test.tsx`. Expected: fails — component not yet wired.
- [ ] **Step 3: Implement `live-feed.tsx`.**
  ```tsx
  "use client";
  import { useEffect, useState } from "react";
  import { useTournamentEvents, type LiveEvent } from "@/hooks/use-tournament-events";

  const trunc = (a: string) => (a.length > 9 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a);

  function gloss(ev: LiveEvent): string {
    if (ev.type === "REGISTERED") {
      const player = trunc(String(ev.data.player));
      return `Player ${player} joined`;
    }
    if (ev.type === "FINALIZED") {
      return `Payouts sent: 1st → ${trunc(String(ev.data.first))}, 2nd → ${trunc(String(ev.data.second))}, 3rd → ${trunc(String(ev.data.third))}`;
    }
    return `Tournament cancelled — ${String(ev.data.refundedCount)} players refunded`;
  }

  export function LiveFeed({ tournamentId }: { tournamentId: string }) {
    const { events } = useTournamentEvents(tournamentId);
    const [reduced, setReduced] = useState(false);
    useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);

    return (
      <section className="kinetic-glass p-6" aria-live="polite">
        <header className="mb-4 flex items-center gap-2">
          <span className="pulse-live inline-block h-2 w-2 rounded-full bg-acid-yellow" aria-hidden />
          <span className="font-mono text-acid-yellow tracking-[0.1em] text-xs uppercase">Live feed</span>
        </header>
        <ul className={reduced ? "" : "animate-ticker-scroll"}>
          {events.map((ev, i) => (
            <li key={`${ev.txHash}-${i}`} className="border-outline-variant border-b py-2">
              <span className="font-mono text-data-mono text-on-surface">{gloss(ev)}</span>
            </li>
          ))}
        </ul>
        {events.length === 0 && (
          <p className="text-on-surface-variant text-sm">No registrations yet — scan the QR to join.</p>
        )}
      </section>
    );
  }
  ```
  (The `animate-ticker-scroll` utility maps to the BRAND §6 `ticker-scroll` keyframe defined in Phase 0's global stylesheet; `pulse-live`/`glow-pulse-acid` likewise. If those are missing, add them in the global stylesheet here.)
- [ ] **Step 4: Run, expect PASS.** `pnpm --filter web vitest run src/components/live-feed.test.tsx`. Expected: `2 passed`.
- [ ] **Step 5: Final web typecheck + full suites.** Run `pnpm --filter web exec tsc --noEmit && pnpm --filter web vitest run && pnpm --filter subscriber vitest run`.
  Expected: typecheck 0; all web + subscriber tests pass.
- [ ] **Step 6: Commit.**
  ```bash
  git add apps/web/src/components/live-feed.tsx apps/web/src/components/live-feed.test.tsx
  git commit -m "Wire LiveFeed to SSE ticker with human-readable gloss + reduced-motion guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"
  ```

---

## Task 12: End-to-end live propagation verification

**Files:** none (verification only; uses `superpowers:verification-before-completion`).

**Interfaces:** Consumes the full Phase 5 stack against the docker-compose Postgres + Redis (Phase 0) and Testnet RPC/Horizon.

- [ ] **Step 1: Boot dependencies.** `docker compose up -d postgres redis` then `pnpm --filter web prisma migrate deploy`.
  Expected: containers healthy; migrations (incl. `SubscriberCursor`, `add_contractevent_txhash_unique`) applied.
- [ ] **Step 2: Start subscriber + web.** In two shells: `pnpm --filter subscriber dev` and `pnpm --filter web dev`.
  Expected: subscriber logs `[subscriber] started`; web serves the detail page.
- [ ] **Step 3: Verify join propagation.** With an ACTIVE Testnet tournament (from Phase 4), submit a `join_tournament` via the UI; observe the detail page pool counter tick up and a feed row appear WITHOUT refresh.
  Expected: a `REGISTERED` `ContractEvent` row exists; SSE delivered the change.
- [ ] **Step 4: Verify cursor recovery.** Stop the subscriber (`SIGTERM`), submit another join, restart the subscriber.
  Expected: on restart it resumes from the stored `SubscriberCursor.ledger`, ingests the missed join exactly once (no duplicate `Participant`), publishes it.
- [ ] **Step 5: Verify SEP-7 reconciliation.** Send a raw Stellar payment to the contract address with `memo == tournamentId` (no `join_tournament` call).
  Expected: subscriber's Horizon path upserts the sender as a `Participant` + `REGISTERED` `ContractEvent`; the feed shows the registration.
- [ ] **Step 6: Verify finalize + cancel.** Finalize a tournament and (separately) cancel one.
  Expected: 3 `Payout` rows + `status=FINISHED`+`finalizedAt` (resp. `status=CANCELLED`+`cancelledAt`); the detail page reflects each live.
- [ ] **Step 7: Record evidence.** Capture the relevant logs/DB rows confirming Steps 3–6 in the task notes (no file committed).

---

## Self-review against SPEC §11 / §6 / §8 + AGENT §5

- **Separate Railway service** — Task 2 scaffolds `apps/subscriber` as its own package; deploy as a separate service (SPEC §14, roadmap §1). ✓
- **Per-contract ledger cursor + at-least-once** — Tasks 1, 4, 7 (cursor advanced only after ingest+publish; restart-recovery tested in Task 4 Step 4 and Task 12 Step 4). ✓
- **Idempotent upserts deduped on `txHash`** — Task 5 (`@@unique([txHash, type])`; replay test asserts a single write and `null` return). SEP-7 dedupe via the same `applyEvent` path (Task 6). ✓
- **All three event types** — `registered`/`finalized`/`cancelled` mapped in Tasks 5 + 7 with dedicated tests each. ✓
- **SEP-7 reconciliation (`memo == tournamentId`)** — Task 6; treats deposits as untrusted (memo + destination match required), idempotent. ✓
- **Redis publish to `tournament:<id>`** — Task 7 (`channelFor`); ephemeral, not source of truth. ✓
- **SSE handler (`text/event-stream`, polling fallback)** — Task 9; real `ReadableStream`, DB replay first, Redis subscribe, `?fallback=poll`; test asserts replay + live `data:` frames. ✓
- **Live components** — `<PrizePoolCounter>` tick-up pop (Task 10) and `<LiveFeed>` ticker (Task 11), both `prefers-reduced-motion`-guarded (BRAND §6); EventSource reconnect tested (Task 10). ✓
- **Zod-validate RPC/Horizon** — Task 3 (`decodeEventsResponse`, `paymentSchema`). ✓
- **BigInt money** — Payout amounts and pool handled as `BigInt`, serialised as decimal strings (Tasks 5, 10). ✓
- **Reconcile UI against confirmed events** — SSE emits only `ContractEvent`-backed payloads; replay from DB on connect (Task 9). ✓
- **Names** — `ContractEvent`/`Participant`/`Payout`/`Tournament`/`EventType`, channel `tournament:<id>`, `getCursor`/`setCursor`, `pollTournament`, `publishChange`, `<LiveFeed>`/`<PrizePoolCounter>`, `GET /api/tournaments/[id]/events` all match the contract. ✓

Uncovered: none. The only added schema beyond Phase 0 is `SubscriberCursor` (Task 1) and a `ContractEvent` `@@unique([txHash, type])` (Task 5) — both are net-new migrations, the interface contract explicitly permits choosing the cursor store.
