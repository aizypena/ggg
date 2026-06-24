import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";

vi.mock("@/lib/redis", () => {
  const mock = new RedisMock();
  return { redis: mock };
});

import { redis } from "@/lib/redis";
import { rateLimit } from "./rate-limit";

beforeEach(async () => {
  await redis.flushall();
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks the next call", async () => {
    const opts = { limit: 3, windowSec: 60 };
    const r1 = await rateLimit("ip:1.2.3.4", opts);
    await rateLimit("ip:1.2.3.4", opts);
    const r3 = await rateLimit("ip:1.2.3.4", opts);
    const r4 = await rateLimit("ip:1.2.3.4", opts);

    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.ok).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("keys are independent", async () => {
    const opts = { limit: 1, windowSec: 60 };
    expect((await rateLimit("ip:a", opts)).ok).toBe(true);
    expect((await rateLimit("ip:b", opts)).ok).toBe(true);
    expect((await rateLimit("ip:a", opts)).ok).toBe(false);
  });
});
