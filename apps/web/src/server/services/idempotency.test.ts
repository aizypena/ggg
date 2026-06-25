import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock redis before importing the module under test.
// vi.hoisted ensures the mock object is available inside vi.mock's factory.
// ---------------------------------------------------------------------------

const { redisMock, store } = vi.hoisted(() => {
  const store = new Map<string, string>();

  const redisMock = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]): Promise<"OK" | null> => {
      const upper = args.map((a) => (typeof a === "string" ? a.toUpperCase() : a));
      const isNX = upper.includes("NX");
      if (isNX && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };

  return { redisMock, store };
});

vi.mock("@/lib/redis", () => ({ redis: redisMock }));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { withIdempotency, idempotencyConfig } from "./idempotency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  store.clear();
  vi.clearAllMocks();
  redisMock.get.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisMock.set.mockImplementation(
    async (key: string, value: string, ...args: unknown[]): Promise<"OK" | null> => {
      const upper = args.map((a) => (typeof a === "string" ? a.toUpperCase() : a));
      const isNX = upper.includes("NX");
      if (isNX && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
  );
  redisMock.del.mockImplementation(async (key: string) => {
    store.delete(key);
    return 1;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withIdempotency", () => {
  // Shrink poll timings so the "lock held" tests finish quickly.
  const origPollIntervalMs = idempotencyConfig.pollIntervalMs;
  const origPollMaxMs = idempotencyConfig.pollMaxMs;

  beforeEach(() => {
    resetStore();
    idempotencyConfig.pollIntervalMs = 20;
    idempotencyConfig.pollMaxMs = 200;
  });

  afterEach(() => {
    idempotencyConfig.pollIntervalMs = origPollIntervalMs;
    idempotencyConfig.pollMaxMs = origPollMaxMs;
  });

  it("calls fn and returns its result on first invocation", async () => {
    const fn = vi.fn(async () => ({ value: 42 }));
    const result = await withIdempotency("key1", fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: 42 });
  });

  it("returns cached result and does NOT call fn on second invocation", async () => {
    const fn = vi.fn(async () => ({ value: 42 }));
    await withIdempotency("key2", fn);
    const second = await withIdempotency("key2", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ value: 42 });
  });

  it("stores result with 24-hour TTL (SET … EX 86400)", async () => {
    const fn = vi.fn(async () => ({ ok: true }));
    await withIdempotency("key3", fn);

    // Find the SET call that stored the result (not the lock).
    const resultSetCall = redisMock.set.mock.calls.find((args) => args[0] === "idem:key3");
    expect(resultSetCall).toBeDefined();
    const callArgs = (resultSetCall as unknown[])
      .slice(2)
      .map((a: unknown) => (typeof a === "string" ? a.toUpperCase() : a));
    expect(callArgs).toContain("EX");
    expect(callArgs).toContain(86400);
  });

  // ---------------------------------------------------------------------------
  // Fix 1: race / lock test — simulates "lock already held, result not yet
  // present" and asserts fn() (submitMock) is NOT called a second time.
  // ---------------------------------------------------------------------------

  it("does NOT call fn when lock is held and result arrives during poll", async () => {
    const fn = vi.fn(async () => ({ value: "done" }));

    // Pre-set the lock so the first SET NX for the lock key fails.
    store.set("idem:lock:race-key", "some-other-token");

    // Schedule the result to appear after 50ms (within 200ms poll window).
    const tid = setTimeout(() => {
      store.set("idem:race-key", JSON.stringify({ value: "done" }));
    }, 50);

    const result = await withIdempotency("race-key", fn);

    clearTimeout(tid);

    // fn must NOT have been called (lock was held by another worker).
    expect(fn).not.toHaveBeenCalled();
    expect(result).toEqual({ value: "done" });
  });

  it("throws IN_PROGRESS when lock is held and result never appears within poll window", async () => {
    const fn = vi.fn(async () => ({ value: "never" }));

    // Pre-set the lock; result key never appears.
    store.set("idem:lock:stuck-key", "other-token");

    await expect(withIdempotency("stuck-key", fn)).rejects.toMatchObject({
      code: "IN_PROGRESS",
      status: 409,
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
