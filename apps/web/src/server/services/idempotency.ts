import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

/** Overridable for tests (shorter poll windows). */
export const idempotencyConfig = {
  lockTtlSec: 60, // long enough for a Stellar poll
  resultTtlSec: 86400, // 24 h
  pollIntervalMs: 100,
  pollMaxMs: 5_000,
};

/**
 * Wraps `fn` with idempotency: if `key` was seen before, the prior result is
 * returned without re-executing. Results are stored for 24 hours.
 *
 * Race safety: before calling fn() we acquire an atomic Redis lock
 * (`SET idem:lock:{key} NX EX 60`). If two concurrent requests arrive with the
 * same key, only the one that wins the lock will call fn(). The other polls
 * briefly for the result and returns it once available; if the result does not
 * appear within the poll window it returns a structured IN_PROGRESS error so
 * the caller can retry.
 */
export async function withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const { lockTtlSec, resultTtlSec, pollIntervalMs, pollMaxMs } = idempotencyConfig;
  const resultKey = `idem:${key}`;
  const lockKey = `idem:lock:${key}`;

  // 1. Fast path: result already cached.
  const existing = await redis.get(resultKey);
  if (existing !== null) return JSON.parse(existing) as T;

  // 2. Acquire atomic lock.
  const token = randomUUID();
  const acquired = await redis.set(lockKey, token, "EX", lockTtlSec, "NX");

  if (acquired !== "OK") {
    // Another worker holds the lock — poll for the result.
    const deadline = Date.now() + pollMaxMs;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      const polled = await redis.get(resultKey);
      if (polled !== null) return JSON.parse(polled) as T;
    }
    // Result still not available — tell caller to retry.
    throw Object.assign(
      new Error("Idempotent operation is still in progress. Retry after a moment."),
      { code: "IN_PROGRESS", status: 409 },
    );
  }

  // 3. Lock acquired — re-check (another worker may have just finished).
  try {
    const recheck = await redis.get(resultKey);
    if (recheck !== null) return JSON.parse(recheck) as T;

    // 4. Execute the operation.
    const result = await fn();

    // 5. Cache the result (NX: only if not already set — harmless if another
    //    process raced between the recheck and here).
    await redis.set(resultKey, JSON.stringify(result), "EX", resultTtlSec, "NX");

    return result;
  } finally {
    // Release the lock only if we still own it.
    const current = await redis.get(lockKey);
    if (current === token) {
      await redis.del(lockKey);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
