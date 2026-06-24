import { redis } from "@/lib/redis";

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

// Fixed-window counter. First hit in a window sets the TTL; subsequent hits
// increment. `ok` is false once the count exceeds the limit.
export async function rateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<{ ok: boolean; remaining: number }> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, opts.windowSec);
  }
  const remaining = Math.max(0, opts.limit - count);
  return { ok: count <= opts.limit, remaining };
}
