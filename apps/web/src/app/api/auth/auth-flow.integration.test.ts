import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { authorizeCredentials } from "@/lib/auth";
import { createSession, isSessionValid, revokeSession, newSessionId } from "@/lib/session-store";
import { POST as registerPost } from "@/app/api/auth/register/route";

const INTEGRATION_USER_PREFIX = "it_user_";

function makeUniqueUser(): string {
  return `${INTEGRATION_USER_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildRegisterRequest(body: unknown, opts?: { origin?: string; host?: string; xForwardedFor?: string }): Request {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (opts?.origin) headers.set("origin", opts.origin);
  if (opts?.host) headers.set("host", opts.host);
  if (opts?.xForwardedFor) headers.set("x-forwarded-for", opts.xForwardedFor);
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("auth-flow integration", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: INTEGRATION_USER_PREFIX } } });
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: INTEGRATION_USER_PREFIX } } });
    await redis.flushdb();
    await redis.quit();
    await prisma.$disconnect();
  });

  it("register persists an ORGANIZER in Postgres with argon2id hash", async () => {
    const username = makeUniqueUser();
    const password = "SecureP@ssw0rd123";
    const req = buildRegisterRequest({ username, password }, { origin: "http://localhost:3000", host: "localhost:3000" });
    const res = await registerPost(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: true; data: { id: string; username: string } };
    expect(json.ok).toBe(true);
    expect(json.data.username).toBe(username);

    const user = await prisma.user.findUnique({ where: { username } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("ORGANIZER");
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("authorizeCredentials accepts correct password and rejects wrong password and non-existent user", async () => {
    const username = makeUniqueUser();
    const password = "CorrectHorseBatteryStaple!1";
    const req = buildRegisterRequest({ username, password }, { origin: "http://localhost:3000", host: "localhost:3000" });
    await registerPost(req);

    const ok = await authorizeCredentials({ username, password });
    expect(ok).not.toBeNull();
    expect(ok!.username).toBe(username);
    expect(ok!.role).toBe("ORGANIZER");

    const wrong = await authorizeCredentials({ username, password: "wrongpassword123" });
    expect(wrong).toBeNull();

    const missing = await authorizeCredentials({ username: "definitely_not_a_real_user_12345", password: "irrelevant" });
    expect(missing).toBeNull();
  });

  it("session create / revoke / isValid works against Redis", async () => {
    const userId = "user-123";
    const sid = newSessionId();

    expect(await isSessionValid(userId, sid)).toBe(false);

    await createSession(userId, sid, 60);
    expect(await isSessionValid(userId, sid)).toBe(true);

    await revokeSession(userId, sid);
    expect(await isSessionValid(userId, sid)).toBe(false);
  });

  it("duplicate registration returns generic 409", async () => {
    const username = makeUniqueUser();
    const password = "SecureP@ssw0rd123";
    const req1 = buildRegisterRequest({ username, password }, { origin: "http://localhost:3000", host: "localhost:3000" });
    const res1 = await registerPost(req1);
    expect(res1.status).toBe(201);

    const req2 = buildRegisterRequest({ username, password: "DifferentP@ssw0rd123" }, { origin: "http://localhost:3000", host: "localhost:3000" });
    const res2 = await registerPost(req2);
    expect(res2.status).toBe(409);
    const json = (await res2.json()) as { ok: false; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("per-IP rate limit blocks after repeated attempts", async () => {
    const ip = `192.168.1.${Math.floor(Math.random() * 255)}`;
    const username = makeUniqueUser();
    const password = "SecureP@ssw0rd123";

    for (let i = 0; i < 5; i++) {
      const u = `${username}_${i}`;
      const req = buildRegisterRequest({ username: u, password }, { origin: "http://localhost:3000", host: "localhost:3000", xForwardedFor: ip });
      const res = await registerPost(req);
      expect(res.status).toBe(201);
    }

    const blockedReq = buildRegisterRequest({ username: `${username}_blocked`, password }, { origin: "http://localhost:3000", host: "localhost:3000", xForwardedFor: ip });
    const blockedRes = await registerPost(blockedReq);
    expect(blockedRes.status).toBe(429);
    const json = (await blockedRes.json()) as { ok: false; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("cross-origin register returns 403 (CSRF)", async () => {
    const username = makeUniqueUser();
    const password = "SecureP@ssw0rd123";
    const req = buildRegisterRequest({ username, password }, { origin: "http://evil.com", host: "localhost:3000" });
    const res = await registerPost(req);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
  });
});
