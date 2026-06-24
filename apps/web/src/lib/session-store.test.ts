import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";

vi.mock("@/lib/redis", () => {
  const mock = new RedisMock();
  return { redis: mock };
});

import { redis } from "@/lib/redis";
import {
  createSession,
  isSessionValid,
  revokeSession,
  revokeAllForUser,
  newSessionId,
} from "./session-store";

beforeEach(async () => {
  await redis.flushall();
});

describe("session-store", () => {
  it("a created session is valid, a revoked one is not", async () => {
    const sid = newSessionId();
    await createSession("user-1", sid, 3600);
    expect(await isSessionValid("user-1", sid)).toBe(true);

    await revokeSession("user-1", sid);
    expect(await isSessionValid("user-1", sid)).toBe(false);
  });

  it("unknown sessions are invalid", async () => {
    expect(await isSessionValid("user-1", "never-created")).toBe(false);
  });

  it("revokeAllForUser kills every live session for that user", async () => {
    const a = newSessionId();
    const b = newSessionId();
    await createSession("user-9", a, 3600);
    await createSession("user-9", b, 3600);
    await revokeAllForUser("user-9");
    expect(await isSessionValid("user-9", a)).toBe(false);
    expect(await isSessionValid("user-9", b)).toBe(false);
  });

  it("newSessionId returns a unique, non-empty id", () => {
    expect(newSessionId()).not.toBe(newSessionId());
    expect(newSessionId().length).toBeGreaterThan(16);
  });
});
