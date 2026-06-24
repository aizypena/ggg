import { redis } from "@/lib/redis";

/**
 * Wraps `fn` with idempotency: if `key` was seen before, the prior result is
 * returned without re-executing. Results are stored for 24 hours using Redis
 * SET … NX (first writer wins; safe under concurrent retries).
 */
export async function withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cacheKey = `idem:${key}`;
  const existing = await redis.get(cacheKey);
  if (existing !== null) return JSON.parse(existing) as T;
  const result = await fn();
  // SET … NX: only store if the key doesn't yet exist, preventing races.
  await redis.set(cacheKey, JSON.stringify(result), "EX", 86400, "NX");
  return result;
}
