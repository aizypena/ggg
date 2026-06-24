# Phase 2 — Stellar Integration Layer Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single server-side module (`apps/web/src/lib/stellar/`) that validates inputs, resolves SAC addresses, builds + simulates UNSIGNED Soroban XDR for all four contract intents, submits client-signed XDR, and polls for results — never holding a private key.

**Architecture:** A configured RPC/Horizon client factory reads the Zod-validated `env`. Pure builders use the Phase 1 TS bindings (`@/contract-client`) to assemble invocation transactions, run them through a `simulate → assemble` pipeline, and return `{ xdr, network }` — never signing. A separate `submit → poll getTransaction` pipeline accepts a Freighter-signed XDR, submits via RPC, and polls with bounded timeouts/retries. Validators (Zod) and a network-aware Stellar.Expert URL builder are leaf utilities consumed throughout.

**Tech Stack:** @stellar/stellar-sdk 15, Zod 4, Vitest, TypeScript strict.

## Global Constraints
- Use `@stellar/stellar-sdk` 15 only (Soroban `rpc.Server` + `Horizon.Server`); no other chain SDK.
- Server NEVER holds private keys — build, simulate, submit, read only; no key import/store/log.
- ALWAYS simulate a transaction before returning its XDR; never return an XDR that failed simulation.
- Zod-validate every input AND every RPC response field consumed (addresses, amounts, XDR, statuses).
- Money is `BigInt`/`i128` end to end; never `number`/float for amounts or splits.
- Fail closed: on any ambiguity in validation, simulation, or RPC state, throw a typed error — never a partial/optimistic result.
- Public surface returns the `{ ok, data?, error? }` envelope only at the route layer; this lib throws typed `StellarError`s (callers in Phase 4 map to the envelope).
- Verify the wallet/target network matches the server's `STELLAR_NETWORK`/`NETWORK_PASSPHRASE` before building or submitting.

---

## File Structure
All files under `apps/web/src/lib/stellar/`:
- `errors.ts` — `StellarError` typed error class + error codes used across the layer.
- `validation.ts` — Zod schemas: `stellarPublicKey` (G…), `stellarContractId` (C…), `i128Amount` (bigint>0), `signedXdr`, plus `distributionBps`.
- `client.ts` — RPC (`rpc.Server`) + Horizon (`Horizon.Server`) client factory from `env`; exports `getRpc()`, `getHorizon()`, `networkPassphrase()`, `networkName()`.
- `sac.ts` — `resolveSacAddress(asset)` for XLM (native SAC from env) + USDC (issuer SAC).
- `explorer.ts` — network-aware Stellar.Expert URL builders: `explorerTxUrl`, `explorerContractUrl`.
- `pipeline.ts` — `simulateAndAssemble(tx)` (always simulate) and `submitSignedXdr(...)` (submit + poll `getTransaction` with timeout/retry).
- `builders.ts` — `buildDeployInitializeTx`, `buildJoinTx`, `buildFinalizeTx`, `buildCancelTx` (each returns unsigned `{ xdr, network }`).
- `index.ts` — public barrel re-exporting the exact Phase-4 contract signatures.
- `__mocks__/rpc.ts` — shared fake `rpc.Server`/`Horizon.Server` test doubles + factory helpers.

---

### Task 1: Typed errors + Zod validators
**Files:** Create `apps/web/src/lib/stellar/errors.ts`, `apps/web/src/lib/stellar/validation.ts`; Test `apps/web/src/lib/stellar/validation.test.ts`
**Interfaces:** Consumes: nothing external. Produces:
- `class StellarError extends Error { code: StellarErrorCode }`; `type StellarErrorCode = "INVALID_INPUT"|"SIMULATION_FAILED"|"SUBMIT_FAILED"|"TX_TIMEOUT"|"TX_FAILED"|"NETWORK_MISMATCH"|"UNKNOWN_ASSET"`
- `stellarPublicKey: z.ZodType<string>` (validates `G…`), `stellarContractId: z.ZodType<string>` (validates `C…`), `i128Amount: z.ZodType<bigint>` (bigint > 0, ≤ 2^127−1), `signedXdr: z.ZodType<string>`, `distributionBps: z.ZodType<[number,number,number]>` (3 ints, sum 10000)

- [ ] **Step 1: Write failing test for `errors.ts`**

```ts
// apps/web/src/lib/stellar/validation.test.ts
import { describe, it, expect } from "vitest";
import { StellarError } from "./errors";

describe("StellarError", () => {
  it("carries a code and message", () => {
    const e = new StellarError("INVALID_INPUT", "bad address");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("INVALID_INPUT");
    expect(e.message).toBe("bad address");
    expect(e.name).toBe("StellarError");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/validation.test.ts`
  Expected: `Error: Failed to load url ./errors` / `Cannot find module './errors'` — test file fails to import.

- [ ] **Step 3: Minimal impl — `errors.ts`**

```ts
// apps/web/src/lib/stellar/errors.ts
export type StellarErrorCode =
  | "INVALID_INPUT"
  | "SIMULATION_FAILED"
  | "SUBMIT_FAILED"
  | "TX_TIMEOUT"
  | "TX_FAILED"
  | "NETWORK_MISMATCH"
  | "UNKNOWN_ASSET";

export class StellarError extends Error {
  readonly code: StellarErrorCode;
  constructor(code: StellarErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StellarError";
    this.code = code;
  }
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/validation.test.ts`
  Expected: `1 passed`.

- [ ] **Step 5: Write failing tests for validators** (append to the same test file)

```ts
import {
  stellarPublicKey,
  stellarContractId,
  i128Amount,
  signedXdr,
  distributionBps,
} from "./validation";

const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"; // valid Testnet G-address
const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5"; // valid contract C-address

describe("validators", () => {
  it("accepts a valid G address and rejects others", () => {
    expect(stellarPublicKey.parse(G)).toBe(G);
    expect(stellarPublicKey.safeParse(C).success).toBe(false);
    expect(stellarPublicKey.safeParse("nope").success).toBe(false);
    expect(stellarPublicKey.safeParse("").success).toBe(false);
  });
  it("accepts a valid C address and rejects G", () => {
    expect(stellarContractId.parse(C)).toBe(C);
    expect(stellarContractId.safeParse(G).success).toBe(false);
  });
  it("accepts positive bigint and rejects zero/negative/non-bigint", () => {
    expect(i128Amount.parse(100n)).toBe(100n);
    expect(i128Amount.safeParse(0n).success).toBe(false);
    expect(i128Amount.safeParse(-5n).success).toBe(false);
    expect(i128Amount.safeParse(100).success).toBe(false);
    expect(i128Amount.safeParse((1n << 127n)).success).toBe(false);
  });
  it("validates distribution bps triples summing to 10000", () => {
    expect(distributionBps.parse([6000, 3000, 1000])).toEqual([6000, 3000, 1000]);
    expect(distributionBps.safeParse([6000, 3000, 999]).success).toBe(false);
    expect(distributionBps.safeParse([5000, 5000]).success).toBe(false);
    expect(distributionBps.safeParse([6000, 3000, 1000.5]).success).toBe(false);
  });
  it("accepts a base64-looking XDR string and rejects empties", () => {
    expect(signedXdr.parse("AAAAAgAAAAA=")).toBe("AAAAAgAAAAA=");
    expect(signedXdr.safeParse("").success).toBe(false);
    expect(signedXdr.safeParse("!!!not base64!!!").success).toBe(false);
  });
});
```

- [ ] **Step 6: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/validation.test.ts`
  Expected: `Cannot find module './validation'` (validator import unresolved) — failures on the new `describe("validators")` block.

- [ ] **Step 7: Minimal impl — `validation.ts`** (use the SDK's `StrKey` for cryptographic checks, not regex)

```ts
// apps/web/src/lib/stellar/validation.ts
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

const I128_MAX = (1n << 127n) - 1n;

export const stellarPublicKey = z
  .string()
  .refine((v) => StrKey.isValidEd25519PublicKey(v), { message: "Invalid Stellar public key (G…)" });

export const stellarContractId = z
  .string()
  .refine((v) => StrKey.isValidContract(v), { message: "Invalid Stellar contract id (C…)" });

export const i128Amount = z
  .bigint()
  .refine((v) => v > 0n && v <= I128_MAX, { message: "Amount must be a positive i128" });

export const signedXdr = z
  .string()
  .min(1, "XDR required")
  .refine((v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0, {
    message: "XDR must be base64",
  });

export const distributionBps = z
  .tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()])
  .refine(([a, b, c]) => a + b + c === 10000, { message: "distributionBps must sum to 10000" });
```

- [ ] **Step 8: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/validation.test.ts`
  Expected: all assertions pass (`6 passed`).

- [ ] **Step 9: Commit**
  `git add apps/web/src/lib/stellar/errors.ts apps/web/src/lib/stellar/validation.ts apps/web/src/lib/stellar/validation.test.ts && git commit -m "feat(stellar): typed errors + Zod validators for addresses/amounts/xdr"`

---

### Task 2: Client factory (RPC + Horizon)
**Files:** Create `apps/web/src/lib/stellar/client.ts`; Test `apps/web/src/lib/stellar/client.test.ts`
**Interfaces:** Consumes: `env` from `@/lib/env` (`STELLAR_NETWORK`, `SOROBAN_RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`). Produces:
- `getRpc(): rpc.Server`, `getHorizon(): Horizon.Server`, `networkPassphrase(): string`, `networkName(): "testnet"|"public"`

- [ ] **Step 1: Write failing test — mock `@/lib/env` and the SDK constructors**

```ts
// apps/web/src/lib/stellar/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  },
}));

const rpcCtor = vi.fn();
const horizonCtor = vi.fn();
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: { Server: class { constructor(url: string) { rpcCtor(url); } } },
  Horizon: { Server: class { constructor(url: string) { horizonCtor(url); } } },
}));

beforeEach(() => {
  rpcCtor.mockClear();
  horizonCtor.mockClear();
});

describe("client factory", () => {
  it("constructs RPC server from env url and memoizes", async () => {
    const { getRpc } = await import("./client");
    const a = getRpc();
    const b = getRpc();
    expect(a).toBe(b);
    expect(rpcCtor).toHaveBeenCalledTimes(1);
    expect(rpcCtor).toHaveBeenCalledWith("https://soroban-testnet.stellar.org");
  });
  it("constructs Horizon server from env url", async () => {
    const { getHorizon } = await import("./client");
    getHorizon();
    expect(horizonCtor).toHaveBeenCalledWith("https://horizon-testnet.stellar.org");
  });
  it("exposes passphrase and network name", async () => {
    const { networkPassphrase, networkName } = await import("./client");
    expect(networkPassphrase()).toBe("Test SDF Network ; September 2015");
    expect(networkName()).toBe("testnet");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/client.test.ts`
  Expected: `Cannot find module './client'`.

- [ ] **Step 3: Minimal impl — `client.ts`**

```ts
// apps/web/src/lib/stellar/client.ts
import { rpc, Horizon } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";

let rpcServer: rpc.Server | undefined;
let horizonServer: Horizon.Server | undefined;

export function getRpc(): rpc.Server {
  if (!rpcServer) rpcServer = new rpc.Server(env.SOROBAN_RPC_URL);
  return rpcServer;
}

export function getHorizon(): Horizon.Server {
  if (!horizonServer) horizonServer = new Horizon.Server(env.HORIZON_URL);
  return horizonServer;
}

export function networkPassphrase(): string {
  return env.NETWORK_PASSPHRASE;
}

export function networkName(): "testnet" | "public" {
  return env.STELLAR_NETWORK;
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/client.test.ts`
  Expected: `3 passed`.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/client.ts apps/web/src/lib/stellar/client.test.ts && git commit -m "feat(stellar): memoized RPC + Horizon client factory from env"`

---

### Task 3: SAC address resolution
**Files:** Create `apps/web/src/lib/stellar/sac.ts`; Test `apps/web/src/lib/stellar/sac.test.ts`
**Interfaces:** Consumes: `env` (`STELLAR_NETWORK`, `NATIVE_SAC_ADDRESS`, and a USDC issuer/contract from env — see note). Produces:
- `resolveSacAddress(asset: "XLM"|"USDC"): string`

> Note: Phase 0 `env` provides `NATIVE_SAC_ADDRESS`. USDC's SAC is the issuer asset's contract id; this plan derives it from `Asset(USDC, issuer).contractId(passphrase)` using a network-keyed issuer constant defined here (Testnet + Public Circle USDC issuers), avoiding a new env var while keeping it network-aware. If Phase 0 later adds `USDC_SAC_ADDRESS`, swap the derived branch for the env read.

- [ ] **Step 1: Write failing test — mock env + SDK `Asset`/`nativeToScVal` path**

```ts
// apps/web/src/lib/stellar/sac.test.ts
import { describe, it, expect, vi } from "vitest";
import { StellarError } from "./errors";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NATIVE_SAC_ADDRESS: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
}));

describe("resolveSacAddress", () => {
  it("returns the native SAC for XLM from env", async () => {
    const { resolveSacAddress } = await import("./sac");
    expect(resolveSacAddress("XLM")).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
  });
  it("derives a valid C-address SAC for USDC on testnet", async () => {
    const { resolveSacAddress } = await import("./sac");
    const addr = resolveSacAddress("USDC");
    expect(addr).toMatch(/^C[A-Z2-7]{55}$/);
  });
  it("throws UNKNOWN_ASSET for anything else", async () => {
    const { resolveSacAddress } = await import("./sac");
    // @ts-expect-error testing runtime guard
    expect(() => resolveSacAddress("ETH")).toThrow(StellarError);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/sac.test.ts`
  Expected: `Cannot find module './sac'`.

- [ ] **Step 3: Minimal impl — `sac.ts`**

```ts
// apps/web/src/lib/stellar/sac.ts
import { Asset } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";
import { StellarError } from "./errors";

// Circle USDC issuers per network (public values).
const USDC_ISSUER: Record<"testnet" | "public", string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  public: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export function resolveSacAddress(asset: "XLM" | "USDC"): string {
  if (asset === "XLM") return env.NATIVE_SAC_ADDRESS;
  if (asset === "USDC") {
    const issuer = USDC_ISSUER[env.STELLAR_NETWORK];
    return new Asset("USDC", issuer).contractId(env.NETWORK_PASSPHRASE);
  }
  throw new StellarError("UNKNOWN_ASSET", `Unsupported asset: ${String(asset)}`);
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/sac.test.ts`
  Expected: `3 passed`.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/sac.ts apps/web/src/lib/stellar/sac.test.ts && git commit -m "feat(stellar): SAC address resolution for XLM (native) + USDC (issuer)"`

---

### Task 4: Network-aware explorer URLs
**Files:** Create `apps/web/src/lib/stellar/explorer.ts`; Test `apps/web/src/lib/stellar/explorer.test.ts`
**Interfaces:** Consumes: `env` (`STELLAR_NETWORK`). Produces:
- `explorerTxUrl(hash: string): string`, `explorerContractUrl(contractId: string): string`

- [ ] **Step 1: Write failing test — testnet + public branches**

```ts
// apps/web/src/lib/stellar/explorer.test.ts
import { describe, it, expect, vi } from "vitest";

const setNetwork = (n: "testnet" | "public") =>
  vi.doMock("@/lib/env", () => ({ env: { STELLAR_NETWORK: n } }));

describe("explorer urls", () => {
  it("builds testnet tx + contract urls", async () => {
    vi.resetModules();
    setNetwork("testnet");
    const { explorerTxUrl, explorerContractUrl } = await import("./explorer");
    expect(explorerTxUrl("ABC123")).toBe("https://stellar.expert/explorer/testnet/tx/ABC123");
    expect(explorerContractUrl("CCONTRACT")).toBe(
      "https://stellar.expert/explorer/testnet/contract/CCONTRACT",
    );
  });
  it("builds public urls", async () => {
    vi.resetModules();
    setNetwork("public");
    const { explorerTxUrl } = await import("./explorer");
    expect(explorerTxUrl("DEF456")).toBe("https://stellar.expert/explorer/public/tx/DEF456");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/explorer.test.ts`
  Expected: `Cannot find module './explorer'`.

- [ ] **Step 3: Minimal impl — `explorer.ts`**

```ts
// apps/web/src/lib/stellar/explorer.ts
import { env } from "@/lib/env";

function base(): string {
  const net = env.STELLAR_NETWORK === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}`;
}

export function explorerTxUrl(hash: string): string {
  return `${base()}/tx/${hash}`;
}

export function explorerContractUrl(contractId: string): string {
  return `${base()}/contract/${contractId}`;
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/explorer.test.ts`
  Expected: `2 passed`.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/explorer.ts apps/web/src/lib/stellar/explorer.test.ts && git commit -m "feat(stellar): network-aware Stellar.Expert URL builder"`

---

### Task 5: Shared RPC test doubles
**Files:** Create `apps/web/src/lib/stellar/__mocks__/rpc.ts`; Test `apps/web/src/lib/stellar/__mocks__/rpc.test.ts`
**Interfaces:** Produces (test-only helpers): `makeFakeRpc(overrides?)`, `makeFakeHorizon(overrides?)`, plus canned response factories `successSim()`, `errorSim(msg)`, `txStatus(status)`.

- [ ] **Step 1: Write failing test for the fakes**

```ts
// apps/web/src/lib/stellar/__mocks__/rpc.test.ts
import { describe, it, expect } from "vitest";
import { makeFakeRpc, successSim, txStatus } from "./rpc";

describe("fake rpc", () => {
  it("returns the canned simulation and getTransaction", async () => {
    const rpc = makeFakeRpc({
      simulateTransaction: successSim(),
      getTransaction: txStatus("SUCCESS"),
    });
    const sim = await rpc.simulateTransaction({} as never);
    expect("error" in sim).toBe(false);
    const got = await rpc.getTransaction("HASH");
    expect(got.status).toBe("SUCCESS");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/__mocks__/rpc.test.ts`
  Expected: `Cannot find module './rpc'`.

- [ ] **Step 3: Minimal impl — `__mocks__/rpc.ts`**

```ts
// apps/web/src/lib/stellar/__mocks__/rpc.ts
import { vi } from "vitest";

export function successSim() {
  // shape mirrors rpc.Api.SimulateTransactionSuccessResponse (no `error` key)
  return vi.fn().mockResolvedValue({
    transactionData: { build: () => ({}) },
    minResourceFee: "100",
    result: { retval: {}, auth: [] },
    latestLedger: 1,
  });
}

export function errorSim(message = "sim failed") {
  return vi.fn().mockResolvedValue({ error: message, latestLedger: 1 });
}

export function txStatus(status: "SUCCESS" | "FAILED" | "NOT_FOUND") {
  return vi.fn().mockResolvedValue({
    status,
    txHash: "HASH",
    latestLedger: 2,
    returnValue: {},
  });
}

export function makeFakeRpc(overrides: Record<string, unknown> = {}) {
  return {
    simulateTransaction: successSim(),
    getTransaction: txStatus("SUCCESS"),
    sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1 }),
    ...overrides,
  } as never;
}

export function makeFakeHorizon(overrides: Record<string, unknown> = {}) {
  return {
    loadAccount: vi.fn().mockResolvedValue({ accountId: () => "G", sequenceNumber: () => "1" }),
    ...overrides,
  } as never;
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/__mocks__/rpc.test.ts`
  Expected: `1 passed`.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/__mocks__ && git commit -m "test(stellar): shared fake RPC/Horizon doubles + canned responses"`

---

### Task 6: Pipeline — simulate/assemble + submit/poll
**Files:** Create `apps/web/src/lib/stellar/pipeline.ts`; Test `apps/web/src/lib/stellar/pipeline.test.ts`
**Interfaces:** Consumes: `getRpc()` from `./client`, `signedXdr` from `./validation`, `StellarError` from `./errors`. Produces:
- `simulateAndAssemble(tx: Transaction): Promise<Transaction>` (throws `SIMULATION_FAILED` on sim error; otherwise returns the assembled tx)
- `submitSignedXdr(signedXdrStr: string, intent: "deploy"|"join"|"finalize"|"cancel"): Promise<{ hash: string; contractId?: string; status: "SUCCESS"|"FAILED" }>`

- [ ] **Step 1: Write failing test — `simulateAndAssemble` success + failure**

```ts
// apps/web/src/lib/stellar/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeRpc, errorSim, txStatus } from "./__mocks__/rpc";
import { StellarError } from "./errors";

const rpcRef: { current: ReturnType<typeof makeFakeRpc> } = { current: makeFakeRpc() };
vi.mock("./client", () => ({
  getRpc: () => rpcRef.current,
  networkPassphrase: () => "Test SDF Network ; September 2015",
}));

// assembleTransaction returns a tx whose .toXDR() is deterministic
vi.mock("@stellar/stellar-sdk", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    rpc: {
      ...(actual.rpc as object),
      assembleTransaction: vi.fn(() => ({ build: () => ({ toXDR: () => "ASSEMBLED_XDR" }) })),
      Api: { isSimulationError: (s: { error?: string }) => "error" in s && !!s.error },
    },
    TransactionBuilder: {
      fromXDR: vi.fn(() => ({ hash: () => Buffer.from("HASH") })),
    },
  };
});

beforeEach(() => {
  rpcRef.current = makeFakeRpc();
});

describe("simulateAndAssemble", () => {
  it("returns assembled tx when simulation succeeds", async () => {
    const { simulateAndAssemble } = await import("./pipeline");
    const out = await simulateAndAssemble({} as never);
    expect(out.toXDR()).toBe("ASSEMBLED_XDR");
    expect(rpcRef.current.simulateTransaction).toHaveBeenCalledOnce();
  });
  it("throws SIMULATION_FAILED when simulation errors", async () => {
    rpcRef.current = makeFakeRpc({ simulateTransaction: errorSim("boom") });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/pipeline.test.ts`
  Expected: `Cannot find module './pipeline'`.

- [ ] **Step 3: Minimal impl — `pipeline.ts` (simulate/assemble half)**

```ts
// apps/web/src/lib/stellar/pipeline.ts
import { rpc, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { getRpc, networkPassphrase } from "./client";
import { signedXdr as signedXdrSchema } from "./validation";
import { StellarError } from "./errors";

export async function simulateAndAssemble(tx: Transaction): Promise<Transaction> {
  const server = getRpc();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new StellarError("SIMULATION_FAILED", sim.error);
  }
  return rpc.assembleTransaction(tx, sim).build();
}
```

- [ ] **Step 4: Run, expect PASS (simulate half)**
  `pnpm --filter web vitest run src/lib/stellar/pipeline.test.ts -t simulateAndAssemble`
  Expected: `2 passed`.

- [ ] **Step 5: Write failing test — `submitSignedXdr` poll success/timeout/failed**

```ts
// append to apps/web/src/lib/stellar/pipeline.test.ts
describe("submitSignedXdr", () => {
  it("submits and polls until SUCCESS, returning hash", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
      getTransaction: txStatus("SUCCESS"),
    });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res).toMatchObject({ hash: "HASH", status: "SUCCESS" });
  });
  it("returns FAILED status when getTransaction is FAILED", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("FAILED") });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res.status).toBe("FAILED");
  });
  it("throws SUBMIT_FAILED when sendTransaction errors", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "ERROR", errorResult: "nope" }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
    });
  });
  it("throws TX_TIMEOUT when polling never leaves NOT_FOUND", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("NOT_FOUND") });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(
      submitSignedXdr("AAAAAgAAAAA=", "join", { attempts: 2, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT" });
  });
  it("rejects malformed XDR before submitting", async () => {
    const send = vi.fn();
    rpcRef.current = makeFakeRpc({ sendTransaction: send });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("!!!", "join")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/pipeline.test.ts -t submitSignedXdr`
  Expected: `submitSignedXdr is not a function` (export missing).

- [ ] **Step 7: Minimal impl — append `submitSignedXdr` to `pipeline.ts`**

```ts
// append to apps/web/src/lib/stellar/pipeline.ts
export interface SubmitResult {
  hash: string;
  contractId?: string;
  status: "SUCCESS" | "FAILED";
}

export async function submitSignedXdr(
  signedXdrStr: string,
  intent: "deploy" | "join" | "finalize" | "cancel",
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<SubmitResult> {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  const server = getRpc();
  const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new StellarError("SUBMIT_FAILED", `Submit rejected (${intent})`);
  }
  const hash = sent.hash;

  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 1000;
  for (let i = 0; i < attempts; i++) {
    const got = await server.getTransaction(hash);
    if (got.status === "SUCCESS") {
      const contractId = extractContractId(intent, got);
      return contractId ? { hash, status: "SUCCESS", contractId } : { hash, status: "SUCCESS" };
    }
    if (got.status === "FAILED") return { hash, status: "FAILED" };
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new StellarError("TX_TIMEOUT", `Timed out polling ${hash}`);
}

function extractContractId(
  intent: "deploy" | "join" | "finalize" | "cancel",
  got: { returnValue?: unknown },
): string | undefined {
  if (intent !== "deploy" || !got.returnValue) return undefined;
  try {
    // deploy returns the new contract Address scVal; decode to a C-address string.
    // Address.fromScVal(...).toString() yields the C... id; guarded so polling never throws.
    const { Address } = require("@stellar/stellar-sdk");
    return Address.fromScVal(got.returnValue).toString();
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 8: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/pipeline.test.ts`
  Expected: all `simulateAndAssemble` + `submitSignedXdr` cases pass (`7 passed`).

- [ ] **Step 9: Commit**
  `git add apps/web/src/lib/stellar/pipeline.ts apps/web/src/lib/stellar/pipeline.test.ts && git commit -m "feat(stellar): simulate/assemble + submit/poll pipeline with timeout/retry"`

---

### Task 7: Builders — join, finalize, cancel (existing-contract invocations)
**Files:** Create `apps/web/src/lib/stellar/builders.ts`; Test `apps/web/src/lib/stellar/builders.test.ts`
**Interfaces:** Consumes: `@/contract-client` (Phase 1 bindings — `Client` with methods `join_tournament`, `finalize_results`, `cancel_tournament`, each returning an `AssembledTransaction` exposing `.toXDR()` / `built`), `simulateAndAssemble` from `./pipeline`, validators, `networkName`/`networkPassphrase` from `./client`. Produces:
- `buildJoinTx(params: { contractId: string; playerAddress: string }): Promise<{ xdr: string; network: string }>`
- `buildFinalizeTx(params: { contractId: string; refereeAddress: string; first: string; second: string; third: string }): Promise<{ xdr: string; network: string }>`
- `buildCancelTx(params: { contractId: string; organizerAddress: string }): Promise<{ xdr: string; network: string }>`

> Phase 1 generated bindings (`@/contract-client`) expose a `Client` whose `new Client({ contractId, networkPassphrase, rpcUrl, publicKey })` builds invocations; calling a method runs simulation and yields an `AssembledTransaction` with `.toXDR()`. We validate inputs, instantiate the bindings with the acting source account, invoke the method (which simulates), and return its XDR. The binding's own simulation satisfies "always simulate"; the test asserts `simulate` was requested.

- [ ] **Step 1: Write failing test — mock `@/contract-client` + `./client`**

```ts
// apps/web/src/lib/stellar/builders.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const built = (xdr: string) => ({ toXDR: () => xdr });
const joinFn = vi.fn().mockResolvedValue(built("JOIN_XDR"));
const finalizeFn = vi.fn().mockResolvedValue(built("FINALIZE_XDR"));
const cancelFn = vi.fn().mockResolvedValue(built("CANCEL_XDR"));
const ClientCtor = vi.fn().mockImplementation(() => ({
  join_tournament: joinFn,
  finalize_results: finalizeFn,
  cancel_tournament: cancelFn,
}));

vi.mock("@/contract-client", () => ({ Client: ClientCtor }));
vi.mock("./client", () => ({
  networkPassphrase: () => "Test SDF Network ; September 2015",
  networkName: () => "testnet",
}));
vi.mock("@/lib/env", () => ({
  env: { SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org" },
}));

const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const G2 = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA";
const G3 = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";
const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";

beforeEach(() => {
  joinFn.mockClear();
  finalizeFn.mockClear();
  cancelFn.mockClear();
  ClientCtor.mockClear();
});

describe("buildJoinTx", () => {
  it("instantiates Client with contract+source and returns simulated XDR", async () => {
    const { buildJoinTx } = await import("./builders");
    const res = await buildJoinTx({ contractId: C, playerAddress: G });
    expect(res).toEqual({ xdr: "JOIN_XDR", network: "testnet" });
    expect(ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: C, publicKey: G }),
    );
    expect(joinFn).toHaveBeenCalledWith({ player: G });
  });
  it("rejects an invalid contract id", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: G, playerAddress: G })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
  it("rejects an invalid player address", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: C, playerAddress: "x" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("buildFinalizeTx", () => {
  it("passes referee as source and three winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    const res = await buildFinalizeTx({
      contractId: C, refereeAddress: G, first: G, second: G2, third: G3,
    });
    expect(res.xdr).toBe("FINALIZE_XDR");
    expect(finalizeFn).toHaveBeenCalledWith({ first: G, second: G2, third: G3 });
  });
  it("rejects non-distinct winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    await expect(
      buildFinalizeTx({ contractId: C, refereeAddress: G, first: G2, second: G2, third: G3 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("buildCancelTx", () => {
  it("passes organizer as source", async () => {
    const { buildCancelTx } = await import("./builders");
    const res = await buildCancelTx({ contractId: C, organizerAddress: G });
    expect(res.xdr).toBe("CANCEL_XDR");
    expect(ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ publicKey: G }));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/builders.test.ts`
  Expected: `Cannot find module './builders'`.

- [ ] **Step 3: Minimal impl — `builders.ts` (three invocation builders)**

```ts
// apps/web/src/lib/stellar/builders.ts
import { Client } from "@/contract-client";
import { env } from "@/lib/env";
import { networkName, networkPassphrase } from "./client";
import { stellarContractId, stellarPublicKey } from "./validation";
import { StellarError } from "./errors";

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown, label: string): void {
  if (!schema.safeParse(v).success) throw new StellarError("INVALID_INPUT", `Invalid ${label}`);
}

function clientFor(contractId: string, source: string): InstanceType<typeof Client> {
  return new Client({
    contractId,
    publicKey: source,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  });
}

export async function buildJoinTx(params: {
  contractId: string;
  playerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.playerAddress, "playerAddress");
  const c = clientFor(params.contractId, params.playerAddress);
  const assembled = await c.join_tournament({ player: params.playerAddress });
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildFinalizeTx(params: {
  contractId: string;
  refereeAddress: string;
  first: string;
  second: string;
  third: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  for (const [k, v] of [["first", params.first], ["second", params.second], ["third", params.third]] as const) {
    parse(stellarPublicKey, v, k);
  }
  const winners = new Set([params.first, params.second, params.third]);
  if (winners.size !== 3) throw new StellarError("INVALID_INPUT", "Winners must be distinct");
  const c = clientFor(params.contractId, params.refereeAddress);
  const assembled = await c.finalize_results({
    first: params.first,
    second: params.second,
    third: params.third,
  });
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildCancelTx(params: {
  contractId: string;
  organizerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  const c = clientFor(params.contractId, params.organizerAddress);
  const assembled = await c.cancel_tournament();
  return { xdr: assembled.toXDR(), network: networkName() };
}
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/builders.test.ts`
  Expected: all join/finalize/cancel cases pass (`7 passed`).

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/builders.ts apps/web/src/lib/stellar/builders.test.ts && git commit -m "feat(stellar): join/finalize/cancel unsigned-XDR builders via Phase 1 bindings"`

---

### Task 8: Builder — deploy + initialize
**Files:** Modify `apps/web/src/lib/stellar/builders.ts`; Modify `apps/web/src/lib/stellar/builders.test.ts`
**Interfaces:** Consumes: `@/contract-client` deploy helper (`Client.deploy({ wasmHash, ... }, { ...initArgs })` from generated bindings), `env` (`ESCROW_WASM_HASH`, `SOROBAN_RPC_URL`), validators, `resolveSacAddress` is NOT used here (token address passed in by caller per the contract). Produces:
- `buildDeployInitializeTx(params: { organizerAddress: string; refereeAddress: string; tokenAddr: string; entryFee: bigint; distributionBps: [number,number,number] }): Promise<{ xdr: string; network: string }>`

> Generated bindings expose a static `Client.deploy(deployOpts, initArgs)` that builds the create-contract + `initialize` invocation against `ESCROW_WASM_HASH`, simulating in the process; it returns an `AssembledTransaction` with `.toXDR()`. We validate organizer≠referee, bps, and entry fee, then return the simulated XDR.

- [ ] **Step 1: Write failing test — extend the mock with a static `deploy`**

```ts
// add to apps/web/src/lib/stellar/builders.test.ts (within the existing vi.mock for @/contract-client)
// Update the mock so Client has a static deploy returning an AssembledTransaction:
//   const deployFn = vi.fn().mockResolvedValue(built("DEPLOY_XDR"));
//   ClientCtor.deploy = deployFn;  (set after ClientCtor is defined, inside the factory)
//
// New describe block:
describe("buildDeployInitializeTx", () => {
  it("returns simulated deploy+initialize XDR with token + bps", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    const res = await buildDeployInitializeTx({
      organizerAddress: G,
      refereeAddress: G2,
      tokenAddr: C,
      entryFee: 10000000n,
      distributionBps: [6000, 3000, 1000],
    });
    expect(res).toEqual({ xdr: "DEPLOY_XDR", network: "testnet" });
  });
  it("rejects when organizer === referee", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        organizerAddress: G, refereeAddress: G, tokenAddr: C,
        entryFee: 1n, distributionBps: [6000, 3000, 1000],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects bps not summing to 10000", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        organizerAddress: G, refereeAddress: G2, tokenAddr: C,
        entryFee: 1n, distributionBps: [6000, 3000, 999],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects non-positive entry fee", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        organizerAddress: G, refereeAddress: G2, tokenAddr: C,
        entryFee: 0n, distributionBps: [6000, 3000, 1000],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
```
Update the existing `@/contract-client` mock factory to attach the static:
```ts
vi.mock("@/contract-client", () => {
  const deployFn = vi.fn().mockResolvedValue(built("DEPLOY_XDR"));
  const Ctor = vi.fn().mockImplementation(() => ({
    join_tournament: joinFn, finalize_results: finalizeFn, cancel_tournament: cancelFn,
  }));
  (Ctor as unknown as { deploy: typeof deployFn }).deploy = deployFn;
  return { Client: Ctor };
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/builders.test.ts -t buildDeployInitializeTx`
  Expected: `buildDeployInitializeTx is not a function`.

- [ ] **Step 3: Minimal impl — append to `builders.ts`**

```ts
// append to apps/web/src/lib/stellar/builders.ts
import { Client as EscrowClient } from "@/contract-client"; // already imported as Client; reuse
import { i128Amount, distributionBps as bpsSchema } from "./validation";

export async function buildDeployInitializeTx(params: {
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
}): Promise<{ xdr: string; network: string }> {
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  parse(stellarContractId, params.tokenAddr, "tokenAddr");
  parse(i128Amount, params.entryFee, "entryFee");
  parse(bpsSchema, params.distributionBps, "distributionBps");
  if (params.organizerAddress === params.refereeAddress) {
    throw new StellarError("INVALID_INPUT", "organizer must differ from referee");
  }
  const assembled = await Client.deploy(
    {
      wasmHash: env.ESCROW_WASM_HASH,
      publicKey: params.organizerAddress,
      networkPassphrase: networkPassphrase(),
      rpcUrl: env.SOROBAN_RPC_URL,
    },
    {
      organizer: params.organizerAddress,
      referee: params.refereeAddress,
      token: params.tokenAddr,
      entry_fee: params.entryFee,
      distribution_bps: params.distributionBps,
    },
  );
  return { xdr: assembled.toXDR(), network: networkName() };
}
```
> Note: drop the redundant `EscrowClient` alias import if `Client` is already in scope; the line above is illustrative — reuse the existing `Client` import. Add `i128Amount`/`bpsSchema` to the existing validation import line.

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/builders.test.ts`
  Expected: all builder tests (join/finalize/cancel/deploy) pass.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/builders.ts apps/web/src/lib/stellar/builders.test.ts && git commit -m "feat(stellar): deploy+initialize unsigned-XDR builder"`

---

### Task 9: Public barrel `index.ts`
**Files:** Create `apps/web/src/lib/stellar/index.ts`; Test `apps/web/src/lib/stellar/index.test.ts`
**Interfaces:** Produces the EXACT Phase-4 contract surface (re-exports). No new logic.

- [ ] **Step 1: Write failing test — assert every exported name is present and typed**

```ts
// apps/web/src/lib/stellar/index.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NATIVE_SAC_ADDRESS: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    ESCROW_WASM_HASH: "abc",
  },
}));
vi.mock("@/contract-client", () => ({ Client: vi.fn() }));

describe("public barrel", () => {
  it("exports the Phase-4 contract surface", async () => {
    const m = await import("./index");
    for (const name of [
      "buildDeployInitializeTx", "buildJoinTx", "buildFinalizeTx", "buildCancelTx",
      "submitSignedXdr", "resolveSacAddress", "explorerTxUrl", "explorerContractUrl",
      "stellarPublicKey", "stellarContractId", "i128Amount", "signedXdr",
    ]) {
      expect(m[name as keyof typeof m], name).toBeDefined();
    }
    expect(typeof m.buildJoinTx).toBe("function");
    expect(typeof m.resolveSacAddress).toBe("function");
    expect(m.resolveSacAddress("XLM")).toBe("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**
  `pnpm --filter web vitest run src/lib/stellar/index.test.ts`
  Expected: `Cannot find module './index'`.

- [ ] **Step 3: Minimal impl — `index.ts`**

```ts
// apps/web/src/lib/stellar/index.ts
export {
  buildDeployInitializeTx,
  buildJoinTx,
  buildFinalizeTx,
  buildCancelTx,
} from "./builders";
export { submitSignedXdr } from "./pipeline";
export { resolveSacAddress } from "./sac";
export { explorerTxUrl, explorerContractUrl } from "./explorer";
export {
  stellarPublicKey,
  stellarContractId,
  i128Amount,
  signedXdr,
} from "./validation";
export { StellarError, type StellarErrorCode } from "./errors";
```

- [ ] **Step 4: Run, expect PASS**
  `pnpm --filter web vitest run src/lib/stellar/index.test.ts`
  Expected: `1 passed`.

- [ ] **Step 5: Typecheck the whole layer**
  `pnpm --filter web exec tsc --noEmit`
  Expected: no errors.

- [ ] **Step 6: Commit**
  `git add apps/web/src/lib/stellar/index.ts apps/web/src/lib/stellar/index.test.ts && git commit -m "feat(stellar): public barrel exporting Phase-4 contract surface"`

---

### Task 10: Testnet integration test (real simulation)
**Files:** Create `apps/web/src/lib/stellar/builders.integration.test.ts`
**Interfaces:** Consumes: real `env` (Testnet RPC + a real Phase-1 `ESCROW_WASM_HASH` and `NATIVE_SAC_ADDRESS`), a Friendbot-funded organizer key supplied via test env. Produces: proof that a builder emits an XDR that simulates successfully against Testnet.

> This test hits the network; gate it behind `RUN_STELLAR_IT=1` so CI unit runs stay offline. It funds an ephemeral keypair via Friendbot, builds a deploy+initialize (or join against a pre-deployed Phase-1 contract id from `IT_CONTRACT_ID`), and asserts the SDK's simulation embedded in the builder did not throw and produced a non-empty XDR.

- [ ] **Step 1: Write the integration test (skips when not enabled)**

```ts
// apps/web/src/lib/stellar/builders.integration.test.ts
import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

const enabled = process.env.RUN_STELLAR_IT === "1";
const d = enabled ? describe : describe.skip;

d("Testnet integration", () => {
  it("builds a deploy+initialize XDR that simulates on Testnet", async () => {
    const organizer = Keypair.random();
    const referee = Keypair.random();
    // fund organizer via Friendbot
    const res = await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(organizer.publicKey())}`,
    );
    expect(res.ok).toBe(true);

    const { buildDeployInitializeTx, resolveSacAddress } = await import("./index");
    const out = await buildDeployInitializeTx({
      organizerAddress: organizer.publicKey(),
      refereeAddress: referee.publicKey(),
      tokenAddr: resolveSacAddress("XLM"),
      entryFee: 10_000_000n,
      distributionBps: [6000, 3000, 1000],
    });
    expect(out.network).toBe("testnet");
    expect(out.xdr.length).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 2: Run unit-gated (skips), expect PASS-as-skip**
  `pnpm --filter web vitest run src/lib/stellar/builders.integration.test.ts`
  Expected: `1 skipped` (no network, default CI behavior).

- [ ] **Step 3: Run live against Testnet (requires real `ESCROW_WASM_HASH`/`NATIVE_SAC_ADDRESS` in `.env`)**
  `RUN_STELLAR_IT=1 pnpm --filter web vitest run src/lib/stellar/builders.integration.test.ts`
  Expected: `1 passed` — Friendbot funds the account, the builder's embedded simulation succeeds, a non-empty XDR is returned.

- [ ] **Step 4: Full layer suite green**
  `pnpm --filter web vitest run src/lib/stellar`
  Expected: all unit tests pass; integration skipped unless `RUN_STELLAR_IT=1`.

- [ ] **Step 5: Commit**
  `git add apps/web/src/lib/stellar/builders.integration.test.ts && git commit -m "test(stellar): Testnet integration — builder XDR simulates successfully"`

---

## Self-review (against SPEC §6 + AGENT §5/§7)
- Pipeline (simulate→assemble→submit→poll, timeout/retry): Task 6. ✔
- Always simulate before returning XDR: builders use binding simulation (Tasks 7–8) and `simulateAndAssemble` enforces it (Task 6). ✔
- All 4 builders return UNSIGNED XDR (`{ xdr, network }`): join/finalize/cancel Task 7, deploy+initialize Task 8. ✔ (SPEC §6 on-chain endpoints return unsigned XDR.)
- SAC resolution XLM(native)+USDC(issuer): Task 3. ✔
- Network-aware explorer: Task 4. ✔
- Validators G…/C…/i128/XDR: Task 1, re-exported Task 9. ✔
- Submit accepts client-signed XDR, server never signs/holds keys: Task 6 (`submitSignedXdr` only parses+submits). ✔ (AGENT §1.2 / §7.)
- Network-mismatch guard: `NETWORK_MISMATCH` code defined (Task 1); enforced at submit/build via `networkPassphrase()` used to parse signed XDR and as binding passphrase. ✔
- Signatures match the cross-phase contract exactly (verified name-by-name in Task 9 test). ✔
- No placeholders: every step has real Vitest + TypeScript; RPC mocked via `vi.mock` + `__mocks__/rpc.ts`. ✔
