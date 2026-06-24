import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));

describe("redis singleton", () => {
  it("exports a single reused ioredis instance", async () => {
    const a = (await import("./redis")).redis;
    const b = (await import("./redis")).redis;
    expect(a).toBe(b);
    expect(typeof a.get).toBe("function");
    expect(typeof a.set).toBe("function");
  });
});
