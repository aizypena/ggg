# Phase 3 — Auth & Identity Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up NextAuth/Auth.js v5 credentials auth for GGG — argon2id passwords, an httpOnly+Secure+SameSite=Lax session cookie with Redis-backed revocation, register/login/logout/me routes, ADMIN/ORGANIZER roles, route-group guards, CSRF + rate-limit + security headers — exactly to SPEC §7 and AGENT §7.

**Architecture:** NextAuth v5 (JWT session strategy) owns the cookie and login/logout; we attach a `sessionId` claim and check it against a Redis allow-list on every request so a session can be revoked server-side. Custom `lib/` modules (`password`, `session-store`, `auth-guards`, `rate-limit`, `csrf`, `redis`) supply the spec's hardening; `proxy.ts` redirects unauthenticated users away from `(dashboard)`/`/admin` as defense-in-depth, while per-handler `requireUser()` is the real authz. Register is a custom route handler (NextAuth credentials only signs in existing users); all auth mutations enforce origin/host CSRF checks and per-IP + per-user Redis rate limits.

**Tech Stack:** NextAuth/Auth.js v5 (`next-auth@5`), `argon2`, `ioredis`, Zod 4, Next.js 16 route handlers + `proxy.ts`, Vitest.

## Global Constraints
- Auth machinery is **NextAuth/Auth.js v5** (credentials provider) — not hand-rolled jose.
- Passwords hashed with **argon2id** only; verify with `argon2.verify`; never downgrade.
- Session cookie is **httpOnly + Secure + SameSite=Lax**, short-lived, signed by NextAuth.
- **Redis-backed revocation:** a `sessionId` in the JWT is checked against a Redis allow-list every request; deleting the key kills a live session.
- **Generic auth errors** — login/register failures never reveal which field was wrong (no user enumeration).
- **Rate-limit login + register** in Redis, per-IP **and** per-user (username/identifier).
- **Never log password material** — no password, hash, or cookie value in any log line.
- **Role checks run server-side**, derived from the verified session — never from a client-supplied role.
- All route handlers return the `{ ok, data?, error? }` envelope via `ok()`/`err()` from `@/lib/api`.
- **CSP + security headers** (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, frame protections) on every response.
- **Do not rely on `proxy.ts` alone for authz** — every protected handler calls `requireUser()` independently.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/lib/redis.ts` | ioredis singleton (`redis`) reading `REDIS_URL`; hot-reload safe. |
| `apps/web/src/lib/password.ts` | `hashPassword`/`verifyPassword` (argon2id) + `passwordSchema` policy. |
| `apps/web/src/lib/session-store.ts` | Redis session allow-list: `createSession`, `isSessionValid`, `revokeSession`, `revokeAllForUser`. |
| `apps/web/src/lib/auth.ts` | NextAuth v5 config: Credentials provider, `authorize()` argon2-verifying against Prisma `User`, JWT/session callbacks attaching `{id,username,role,sid}`, cookie options; exports `auth`, `signIn`, `signOut`, `handlers`. |
| `apps/web/src/lib/auth-guards.ts` | `getCurrentUser()` and `requireUser(role?)` — server-side session + revocation + role enforcement. |
| `apps/web/src/lib/rate-limit.ts` | `rateLimit(key, {limit, windowSec})` fixed-window counter in Redis. |
| `apps/web/src/lib/csrf.ts` | `assertSameOrigin(req)` — Origin/Host same-site check; throws on mismatch. |
| `apps/web/src/lib/auth-schemas.ts` | Shared Zod schemas (`credentialsSchema`) used by forms + handlers. |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Re-exports NextAuth `handlers` GET/POST (login/logout/session catch-all). |
| `apps/web/src/app/api/auth/register/route.ts` | `POST` — create ORGANIZER (rate-limit + CSRF + generic errors). |
| `apps/web/src/app/api/auth/me/route.ts` | `GET` — current user or 401. |
| `apps/web/src/app/(auth)/login/page.tsx` | Login form (brand-styled) calling `signIn`. |
| `apps/web/src/app/(auth)/register/page.tsx` | Register form (brand-styled) posting to `/api/auth/register`. |
| `apps/web/proxy.ts` | Next 16 middleware: guards `(dashboard)` + `/admin`, redirects unauthenticated → `/login`, sets security headers/CSP. |
| `apps/web/next.config.ts` | Static `headers()` fallback for security headers. |
| `apps/web/types/next-auth.d.ts` | Module augmentation: `Session.user` shape + JWT `sid`/`role`. |

**Consumes (Phase 0):** `prisma` from `@/lib/db`; `env` from `@/lib/env` (`SESSION_SECRET`, `CSRF_SECRET`, `REDIS_URL`, `APP_URL`, `ADMIN_USERNAME`/`ADMIN_PASSWORD` already seeded); `ok()`/`err()` from `@/lib/api`. Phase 0 may not have shipped `@/lib/redis.ts` — Task 1 creates it.

**Produces (Phase 4/5 consume EXACTLY):**
- `@/lib/auth` → `auth`, `signIn`, `signOut`, `handlers`.
- Session shape: `{ user: { id: string; username: string; role: "ADMIN"|"ORGANIZER" } }`.
- `@/lib/auth-guards` → `requireUser(role?: "ADMIN"|"ORGANIZER") => Promise<SessionUser>`, `getCurrentUser() => Promise<SessionUser|null>`.
- `@/lib/rate-limit` → `rateLimit(key: string, opts: { limit: number; windowSec: number }) => Promise<{ ok: boolean; remaining: number }>`.
- `@/lib/csrf` → `assertSameOrigin(req: Request) => void`.
- Routes: `POST /api/auth/register {username,password}`; login/logout via NextAuth; `GET /api/auth/me`.
- `proxy.ts` guards `(dashboard)` and `/admin`.

---

## Task 0: Install dependencies & types

**Files:** Modify `apps/web/package.json`, `apps/web/types/next-auth.d.ts` (Create)

**Interfaces:** Consumes: nothing new / Produces: installed `next-auth@5`, `argon2`, `ioredis`; NextAuth type augmentation.

- [ ] **Step 0.1: Install runtime deps.**
  - Run: `pnpm --filter web add next-auth@latest argon2 ioredis`
  - Run: `pnpm --filter web add -D vitest @vitest/coverage-v8 ioredis-mock`
  - Expected output: lockfile updated; `next-auth`, `argon2`, `ioredis` appear under `dependencies`.

- [ ] **Step 0.2: Add NextAuth module augmentation.**
  - Create `apps/web/types/next-auth.d.ts`:
```ts
import type { DefaultSession } from "next-auth";

export type AppRole = "ADMIN" | "ORGANIZER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: AppRole;
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    username: string;
    role: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: AppRole;
    sid: string;
  }
}
```
  - Run: `pnpm --filter web exec tsc --noEmit`
  - Expected output: no type errors from this file (other phases may not exist yet — scope check to the file path).

- [ ] **Step 0.3: Add a vitest config if Phase 0 didn't.**
  - Create `apps/web/vitest.config.ts` (skip if present):
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
  - Run: `pnpm --filter web vitest run --reporter=dot` (expect "no test files" — acceptable).

- [ ] **Step 0.4: Commit.**
  - `git add -A && git commit -m "phase3: add next-auth v5, argon2, ioredis deps + types"`

---

## Task 1: Redis singleton (`lib/redis.ts`)

**Files:** Create `apps/web/src/lib/redis.ts`, Test `apps/web/src/lib/redis.test.ts`

**Interfaces:** Consumes: `env` from `@/lib/env` (`REDIS_URL`) / Produces: `redis` (ioredis singleton).

- [ ] **Step 1.1: Write failing test.**
  - Create `apps/web/src/lib/redis.test.ts`:
```ts
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
```
  - Run: `pnpm --filter web vitest run src/lib/redis.test.ts`
  - Expect FAIL: `Cannot find module './redis'`.

- [ ] **Step 1.2: Implement.**
  - Create `apps/web/src/lib/redis.ts`:
```ts
import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis: Redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
```
  - Run: `pnpm --filter web vitest run src/lib/redis.test.ts`
  - Expect PASS.

- [ ] **Step 1.3: Commit.**
  - `git add -A && git commit -m "phase3: redis ioredis singleton (lib/redis.ts)"`

---

## Task 2: Password hashing (`lib/password.ts`)

**Files:** Create `apps/web/src/lib/password.ts`, Test `apps/web/src/lib/password.test.ts`

**Interfaces:** Consumes: `argon2`, Zod 4 / Produces: `hashPassword(plain) => Promise<string>`, `verifyPassword(hash, plain) => Promise<boolean>`, `passwordSchema`.

- [ ] **Step 2.1: Write failing test (hash≠plain & verify roundtrip).**
  - Create `apps/web/src/lib/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, passwordSchema } from "./password";

describe("password util", () => {
  it("produces an argon2id hash that is not the plaintext", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(hash).not.toBe("Sup3r-Secret!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(await verifyPassword(hash, "Sup3r-Secret!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("verify returns false on a malformed hash rather than throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("enforces the password policy (min length)", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a-good-enough-password").success).toBe(true);
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/password.test.ts`
  - Expect FAIL: `Cannot find module './password'`.

- [ ] **Step 2.2: Implement.**
  - Create `apps/web/src/lib/password.ts`:
```ts
import argon2 from "argon2";
import { z } from "zod";

// argon2id with sensible memory/time params (AGENT §7).
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // fail closed on malformed hash; never throw to caller
  }
}

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password is too long");
```
  - Run: `pnpm --filter web vitest run src/lib/password.test.ts`
  - Expect PASS (4 passing).

- [ ] **Step 2.3: Commit.**
  - `git add -A && git commit -m "phase3: argon2id password hash/verify + policy (lib/password.ts)"`

---

## Task 3: Shared auth Zod schema (`lib/auth-schemas.ts`)

**Files:** Create `apps/web/src/lib/auth-schemas.ts`, Test `apps/web/src/lib/auth-schemas.test.ts`

**Interfaces:** Consumes: Zod 4, `passwordSchema` from `@/lib/password` / Produces: `credentialsSchema`, `CredentialsInput`.

- [ ] **Step 3.1: Write failing test.**
  - Create `apps/web/src/lib/auth-schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { credentialsSchema } from "./auth-schemas";

describe("credentialsSchema", () => {
  it("accepts a valid username + password", () => {
    const r = credentialsSchema.safeParse({ username: "organiser_1", password: "a-good-enough-password" });
    expect(r.success).toBe(true);
  });
  it("rejects an empty username", () => {
    expect(credentialsSchema.safeParse({ username: "", password: "a-good-enough-password" }).success).toBe(false);
  });
  it("rejects a too-short password", () => {
    expect(credentialsSchema.safeParse({ username: "ok", password: "short" }).success).toBe(false);
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/auth-schemas.test.ts`
  - Expect FAIL: `Cannot find module './auth-schemas'`.

- [ ] **Step 3.2: Implement.**
  - Create `apps/web/src/lib/auth-schemas.ts`:
```ts
import { z } from "zod";
import { passwordSchema } from "@/lib/password";

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(64, "Username is too long")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, _ . -"),
  password: passwordSchema,
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
```
  - Run: `pnpm --filter web vitest run src/lib/auth-schemas.test.ts`
  - Expect PASS.

- [ ] **Step 3.3: Commit.**
  - `git add -A && git commit -m "phase3: shared credentials Zod schema (lib/auth-schemas.ts)"`

---

## Task 4: Redis session store / revocation (`lib/session-store.ts`)

**Files:** Create `apps/web/src/lib/session-store.ts`, Test `apps/web/src/lib/session-store.test.ts`

**Interfaces:** Consumes: `redis` from `@/lib/redis` / Produces: `createSession(userId, sid, ttlSec)`, `isSessionValid(userId, sid)`, `revokeSession(userId, sid)`, `revokeAllForUser(userId)`, `newSessionId()`.

- [ ] **Step 4.1: Write failing test (revocation invalidates a live session).**
  - Create `apps/web/src/lib/session-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";

const mock = new RedisMock();
vi.mock("@/lib/redis", () => ({ redis: mock }));

import {
  createSession,
  isSessionValid,
  revokeSession,
  revokeAllForUser,
  newSessionId,
} from "./session-store";

beforeEach(async () => {
  await mock.flushall();
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
```
  - Run: `pnpm --filter web vitest run src/lib/session-store.test.ts`
  - Expect FAIL: `Cannot find module './session-store'`.

- [ ] **Step 4.2: Implement.**
  - Create `apps/web/src/lib/session-store.ts`:
```ts
import { randomBytes } from "node:crypto";
import { redis } from "@/lib/redis";

// Allow-list model: a session is only valid while its key exists in Redis.
// Deleting the key (revoke) invalidates a live cookie on the next request.
const key = (userId: string, sid: string) => `session:${userId}:${sid}`;
const userPattern = (userId: string) => `session:${userId}:*`;

export function newSessionId(): string {
  return randomBytes(24).toString("hex");
}

export async function createSession(userId: string, sid: string, ttlSec: number): Promise<void> {
  await redis.set(key(userId, sid), "1", "EX", ttlSec);
}

export async function isSessionValid(userId: string, sid: string): Promise<boolean> {
  if (!userId || !sid) return false;
  return (await redis.exists(key(userId, sid))) === 1;
}

export async function revokeSession(userId: string, sid: string): Promise<void> {
  await redis.del(key(userId, sid));
}

export async function revokeAllForUser(userId: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", userPattern(userId), "COUNT", 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}
```
  - Run: `pnpm --filter web vitest run src/lib/session-store.test.ts`
  - Expect PASS (4 passing).

- [ ] **Step 4.3: Commit.**
  - `git add -A && git commit -m "phase3: redis session allow-list + revocation (lib/session-store.ts)"`

---

## Task 5: Rate limiter (`lib/rate-limit.ts`)

**Files:** Create `apps/web/src/lib/rate-limit.ts`, Test `apps/web/src/lib/rate-limit.test.ts`

**Interfaces:** Consumes: `redis` from `@/lib/redis` / Produces: `rateLimit(key, { limit, windowSec }) => Promise<{ ok: boolean; remaining: number }>`.

- [ ] **Step 5.1: Write failing test (the Nth call blocks).**
  - Create `apps/web/src/lib/rate-limit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";

const mock = new RedisMock();
vi.mock("@/lib/redis", () => ({ redis: mock }));

import { rateLimit } from "./rate-limit";

beforeEach(async () => {
  await mock.flushall();
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks the next call", async () => {
    const opts = { limit: 3, windowSec: 60 };
    const r1 = await rateLimit("ip:1.2.3.4", opts);
    const r2 = await rateLimit("ip:1.2.3.4", opts);
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
```
  - Run: `pnpm --filter web vitest run src/lib/rate-limit.test.ts`
  - Expect FAIL: `Cannot find module './rate-limit'`.

- [ ] **Step 5.2: Implement.**
  - Create `apps/web/src/lib/rate-limit.ts`:
```ts
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
```
  - Run: `pnpm --filter web vitest run src/lib/rate-limit.test.ts`
  - Expect PASS (2 passing).

- [ ] **Step 5.3: Commit.**
  - `git add -A && git commit -m "phase3: redis per-key fixed-window rate limiter (lib/rate-limit.ts)"`

---

## Task 6: CSRF same-origin guard (`lib/csrf.ts`)

**Files:** Create `apps/web/src/lib/csrf.ts`, Test `apps/web/src/lib/csrf.test.ts`

**Interfaces:** Consumes: `env` from `@/lib/env` (`APP_URL`) / Produces: `assertSameOrigin(req: Request) => void`, `CsrfError`.

- [ ] **Step 6.1: Write failing test.**
  - Create `apps/web/src/lib/csrf.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://app.ggg.gg" } }));

import { assertSameOrigin, CsrfError } from "./csrf";

function req(headers: Record<string, string>) {
  return new Request("https://app.ggg.gg/api/auth/register", { method: "POST", headers });
}

describe("assertSameOrigin", () => {
  it("passes when Origin matches the app origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://app.ggg.gg" }))).not.toThrow();
  });

  it("falls back to Host header when Origin is absent", () => {
    expect(() => assertSameOrigin(req({ host: "app.ggg.gg" }))).not.toThrow();
  });

  it("throws CsrfError on a cross-origin request", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.example" }))).toThrow(CsrfError);
  });

  it("throws when neither Origin nor Host is present", () => {
    expect(() => assertSameOrigin(req({}))).toThrow(CsrfError);
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/csrf.test.ts`
  - Expect FAIL: `Cannot find module './csrf'`.

- [ ] **Step 6.2: Implement.**
  - Create `apps/web/src/lib/csrf.ts`:
```ts
import { env } from "@/lib/env";

export class CsrfError extends Error {
  constructor() {
    super("Cross-origin request rejected");
    this.name = "CsrfError";
  }
}

// Same-site defense for cookie-authenticated mutations (SPEC §6 / AGENT §7).
// SameSite=Lax already blocks cross-site cookie sends on most flows; this is
// the origin/host belt-and-braces check. Throws CsrfError on mismatch.
export function assertSameOrigin(req: Request): void {
  const appHost = new URL(env.APP_URL).host;
  const origin = req.headers.get("origin");

  if (origin) {
    try {
      if (new URL(origin).host === appHost) return;
    } catch {
      throw new CsrfError();
    }
    throw new CsrfError();
  }

  const host = req.headers.get("host");
  if (host && host === appHost) return;

  throw new CsrfError();
}
```
  - Run: `pnpm --filter web vitest run src/lib/csrf.test.ts`
  - Expect PASS (4 passing).

- [ ] **Step 6.3: Commit.**
  - `git add -A && git commit -m "phase3: same-origin CSRF guard (lib/csrf.ts)"`

---

## Task 7: NextAuth v5 config (`lib/auth.ts`)

**Files:** Create `apps/web/src/lib/auth.ts`, Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`, Test `apps/web/src/lib/auth.test.ts`

**Interfaces:** Consumes: `prisma` from `@/lib/db`, `env` from `@/lib/env` (`SESSION_SECRET`), `verifyPassword` from `@/lib/password`, `credentialsSchema` from `@/lib/auth-schemas`, `createSession`/`newSessionId` from `@/lib/session-store` / Produces: `auth`, `signIn`, `signOut`, `handlers`, `SESSION_TTL_SEC`.

- [ ] **Step 7.1: Write failing test (authorize argon2-verifies; bad creds return null).**
  - Create `apps/web/src/lib/auth.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" } }));
const createSession = vi.fn();
vi.mock("@/lib/session-store", () => ({
  createSession,
  newSessionId: () => "sid-fixed",
}));

import { hashPassword } from "./password";
import { authorizeCredentials } from "./auth";

beforeEach(() => {
  findUnique.mockReset();
  createSession.mockReset();
});

describe("authorizeCredentials", () => {
  it("returns the user (without hash) on correct password", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      username: "organiser",
      role: "ORGANIZER",
      passwordHash: await hashPassword("a-good-enough-password"),
    });
    const user = await authorizeCredentials({ username: "organiser", password: "a-good-enough-password" });
    expect(user).toEqual({ id: "u1", username: "organiser", role: "ORGANIZER" });
  });

  it("returns null on wrong password (generic, no enumeration)", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      username: "organiser",
      role: "ORGANIZER",
      passwordHash: await hashPassword("a-good-enough-password"),
    });
    expect(await authorizeCredentials({ username: "organiser", password: "WRONG" })).toBeNull();
  });

  it("returns null when the user does not exist (same shape as wrong password)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await authorizeCredentials({ username: "ghost", password: "a-good-enough-password" })).toBeNull();
  });

  it("returns null on malformed input", async () => {
    expect(await authorizeCredentials({ username: "", password: "" })).toBeNull();
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/auth.test.ts`
  - Expect FAIL: `Cannot find module './auth'`.

- [ ] **Step 7.2: Implement `lib/auth.ts`.**
  - Create `apps/web/src/lib/auth.ts`:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { credentialsSchema, type CredentialsInput } from "@/lib/auth-schemas";
import { createSession, newSessionId } from "@/lib/session-store";
import type { AppRole } from "../../types/next-auth";

export const SESSION_TTL_SEC = 60 * 60 * 8; // 8h short-lived session

export interface SessionUser {
  id: string;
  username: string;
  role: AppRole;
}

// Pure, unit-testable authorize. Returns a SessionUser or null — never throws,
// never differentiates "no user" from "bad password" (no enumeration).
export async function authorizeCredentials(raw: unknown): Promise<SessionUser | null> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { username, password }: CredentialsInput = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // Constant-ish work to blunt timing enumeration.
    await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return null;

  return { id: user.id, username: user.username, role: user.role as AppRole };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.SESSION_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_TTL_SEC },
  trustHost: true,
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: "ggg.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
  },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: async (creds) => {
        const user = await authorizeCredentials(creds);
        return user ?? null; // generic failure, no field-level detail
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh login: mint a sessionId and register it in the Redis allow-list.
        const su = user as unknown as SessionUser;
        const sid = newSessionId();
        token.id = su.id;
        token.username = su.username;
        token.role = su.role;
        token.sid = sid;
        await createSession(su.id, sid, SESSION_TTL_SEC);
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        username: token.username,
        role: token.role,
      };
      return session;
    },
  },
});
```
  - Run: `pnpm --filter web vitest run src/lib/auth.test.ts`
  - Expect PASS (4 passing).

- [ ] **Step 7.3: Wire the catch-all route handler.**
  - Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```
  - Run: `pnpm --filter web exec tsc --noEmit` (scope: this file + lib/auth.ts compile clean).
  - Expect: no errors from these files.

- [ ] **Step 7.4: Commit.**
  - `git add -A && git commit -m "phase3: NextAuth v5 credentials provider + sessionId allow-list (lib/auth.ts)"`

---

## Task 8: Auth guards (`lib/auth-guards.ts`)

**Files:** Create `apps/web/src/lib/auth-guards.ts`, Test `apps/web/src/lib/auth-guards.test.ts`

**Interfaces:** Consumes: `auth` from `@/lib/auth`, `isSessionValid` from `@/lib/session-store`, `redirect` from `next/navigation` / Produces: `getCurrentUser() => Promise<SessionUser|null>`, `requireUser(role?) => Promise<SessionUser>`, `AuthError`.

- [ ] **Step 8.1: Write failing test (revocation → null/401; wrong role rejected).**
  - Create `apps/web/src/lib/auth-guards.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const isSessionValid = vi.fn();
vi.mock("@/lib/session-store", () => ({ isSessionValid }));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect }));

import { getCurrentUser, requireUser, AuthError } from "./auth-guards";

beforeEach(() => {
  authMock.mockReset();
  isSessionValid.mockReset();
  redirect.mockClear();
});

function session(role = "ORGANIZER") {
  return { user: { id: "u1", username: "org", role }, sid: "sid-1" };
}

describe("getCurrentUser", () => {
  it("returns the user when the session exists AND is valid in Redis", async () => {
    authMock.mockResolvedValue(session());
    isSessionValid.mockResolvedValue(true);
    expect(await getCurrentUser()).toEqual({ id: "u1", username: "org", role: "ORGANIZER" });
  });

  it("returns null when the session was revoked in Redis (live revocation)", async () => {
    authMock.mockResolvedValue(session());
    isSessionValid.mockResolvedValue(false);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("redirects to /login when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("throws AuthError (403) when the role does not match", async () => {
    authMock.mockResolvedValue(session("ORGANIZER"));
    isSessionValid.mockResolvedValue(true);
    await expect(requireUser("ADMIN")).rejects.toThrow(AuthError);
  });

  it("returns the user when role matches", async () => {
    authMock.mockResolvedValue(session("ADMIN"));
    isSessionValid.mockResolvedValue(true);
    expect(await requireUser("ADMIN")).toEqual({ id: "u1", username: "org", role: "ADMIN" });
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/auth-guards.test.ts`
  - Expect FAIL: `Cannot find module './auth-guards'`.

- [ ] **Step 8.2: Implement.**
  - Create `apps/web/src/lib/auth-guards.ts`:
```ts
import { redirect } from "next/navigation";
import { auth, type SessionUser } from "@/lib/auth";
import { isSessionValid } from "@/lib/session-store";
import type { AppRole } from "../../types/next-auth";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Source of truth for "who is logged in" in handlers/server components.
// Verifies the cookie session AND that the sessionId is still in Redis.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = (await auth()) as
    | { user?: SessionUser; sid?: string }
    | null;
  if (!session?.user || !session.sid) return null;
  if (!(await isSessionValid(session.user.id, session.sid))) return null;
  return session.user;
}

// Defense-in-depth authz (do NOT rely on proxy.ts alone). Redirects to /login
// when unauthenticated; throws AuthError(403) when the role is insufficient.
export async function requireUser(role?: AppRole): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}
```
  - Note: NextAuth's `session()` callback must also surface `sid`. Update the `session` callback in `lib/auth.ts` to add `(session as Record<string, unknown>).sid = token.sid;` before `return session;`.
  - Run: `pnpm --filter web vitest run src/lib/auth-guards.test.ts`
  - Expect PASS (6 passing).

- [ ] **Step 8.3: Surface `sid` in the session callback.**
  - Edit `apps/web/src/lib/auth.ts` `session` callback — add inside it, before `return session;`:
```ts
      (session as unknown as { sid: string }).sid = token.sid;
```
  - Run: `pnpm --filter web vitest run src/lib/auth.test.ts src/lib/auth-guards.test.ts`
  - Expect PASS (both files green).

- [ ] **Step 8.4: Commit.**
  - `git add -A && git commit -m "phase3: server-side auth guards w/ Redis revocation check (lib/auth-guards.ts)"`

---

## Task 9: Register route (`/api/auth/register`)

**Files:** Create `apps/web/src/app/api/auth/register/route.ts`, Test `apps/web/src/app/api/auth/register/route.test.ts`

**Interfaces:** Consumes: `prisma` from `@/lib/db`, `ok`/`err` from `@/lib/api`, `credentialsSchema` from `@/lib/auth-schemas`, `hashPassword` from `@/lib/password`, `rateLimit` from `@/lib/rate-limit`, `assertSameOrigin`/`CsrfError` from `@/lib/csrf` / Produces: `POST` handler creating an ORGANIZER; generic errors.

- [ ] **Step 9.1: Write failing test (creates ORGANIZER; duplicate → generic; rate-limit blocks; CSRF blocks).**
  - Create `apps/web/src/app/api/auth/register/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { create, findUnique } } }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://app.ggg.gg" } }));
vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(async () => "$argon2id$hashed"),
  passwordSchema: (await import("zod")).z.string().min(10),
}));
const rateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));

import { POST } from "./route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.ggg.gg/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.ggg.gg", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  create.mockReset();
  findUnique.mockReset();
  rateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 4 });
});

describe("POST /api/auth/register", () => {
  it("creates an ORGANIZER and returns ok (no password material echoed)", async () => {
    create.mockResolvedValue({ id: "u1", username: "newbie", role: "ORGANIZER" });
    const res = await POST(makeReq({ username: "newbie", password: "a-good-enough-password" }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ id: "u1", username: "newbie" });
    expect(JSON.stringify(json)).not.toContain("password");
  });

  it("returns a GENERIC error on duplicate username (no enumeration)", async () => {
    create.mockRejectedValue({ code: "P2002" }); // Prisma unique violation
    const res = await POST(makeReq({ username: "taken", password: "a-good-enough-password" }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Could not create account");
  });

  it("blocks when rate-limited", async () => {
    rateLimit.mockResolvedValue({ ok: false, remaining: 0 });
    const res = await POST(makeReq({ username: "spammer", password: "a-good-enough-password" }));
    expect(res.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await POST(makeReq({ username: "x", password: "a-good-enough-password" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a validation error on a too-short password (generic field)", async () => {
    const res = await POST(makeReq({ username: "ok", password: "short" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
```
  - Run: `pnpm --filter web vitest run src/app/api/auth/register/route.test.ts`
  - Expect FAIL: `Cannot find module './route'`.

- [ ] **Step 9.2: Implement.**
  - Create `apps/web/src/app/api/auth/register/route.ts`:
```ts
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { credentialsSchema } from "@/lib/auth-schemas";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Parse + validate (generic field-agnostic failure).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid request", 400);
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return err("Invalid username or password format", 400);
  const { username, password } = parsed.data;

  // 3. Rate-limit per-IP AND per-username.
  const ip = clientIp(req);
  const byIp = await rateLimit(`register:ip:${ip}`, { limit: 5, windowSec: 3600 });
  const byUser = await rateLimit(`register:user:${username}`, { limit: 3, windowSec: 3600 });
  if (!byIp.ok || !byUser.ok) return err("Too many attempts. Try again later.", 429);

  // 4. Create the ORGANIZER. Rely on the unique constraint for dedupe → generic error.
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, passwordHash, role: "ORGANIZER" },
      select: { id: true, username: true },
    });
    return ok({ id: user.id, username: user.username }, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return err("Could not create account", 409); // no enumeration
    }
    return err("Could not create account", 500);
  }
}
```
  - Note: `ok(data, status?)` / `err(message, status?)` must accept an optional status (Phase 0 `@/lib/api`). If Phase 0's helpers don't take a status arg, wrap with `new Response` here using the envelope — but prefer extending `@/lib/api`. Confirm signature before implementing.
  - Run: `pnpm --filter web vitest run src/app/api/auth/register/route.test.ts`
  - Expect PASS (5 passing).

- [ ] **Step 9.3: Commit.**
  - `git add -A && git commit -m "phase3: register route — argon2 + CSRF + rate-limit + generic errors"`

---

## Task 10: Me route (`/api/auth/me`)

**Files:** Create `apps/web/src/app/api/auth/me/route.ts`, Test `apps/web/src/app/api/auth/me/route.test.ts`

**Interfaces:** Consumes: `getCurrentUser` from `@/lib/auth-guards`, `ok`/`err` from `@/lib/api` / Produces: `GET` handler returning the current user or 401.

- [ ] **Step 10.1: Write failing test.**
  - Create `apps/web/src/app/api/auth/me/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({ getCurrentUser }));

import { GET } from "./route";

beforeEach(() => getCurrentUser.mockReset());

describe("GET /api/auth/me", () => {
  it("returns the current user when authenticated", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", username: "org", role: "ORGANIZER" });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ id: "u1", username: "org", role: "ORGANIZER" });
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });
});
```
  - Run: `pnpm --filter web vitest run src/app/api/auth/me/route.test.ts`
  - Expect FAIL: `Cannot find module './route'`.

- [ ] **Step 10.2: Implement.**
  - Create `apps/web/src/app/api/auth/me/route.ts`:
```ts
import { ok, err } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth-guards";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return err("Not authenticated", 401);
  return ok(user);
}
```
  - Run: `pnpm --filter web vitest run src/app/api/auth/me/route.test.ts`
  - Expect PASS (2 passing).

- [ ] **Step 10.3: Commit.**
  - `git add -A && git commit -m "phase3: GET /api/auth/me current-user route"`

---

## Task 11: Logout with revocation

**Files:** Modify `apps/web/src/lib/auth.ts` (events hook), Test `apps/web/src/lib/auth-signout.test.ts`

**Interfaces:** Consumes: `revokeSession` from `@/lib/session-store` / Produces: NextAuth `events.signOut` that revokes the Redis sessionId so logout truly invalidates the live session (not just clears the cookie).

- [ ] **Step 11.1: Write failing test.**
  - Create `apps/web/src/lib/auth-signout.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const revokeSession = vi.fn();
vi.mock("@/lib/session-store", () => ({ revokeSession, createSession: vi.fn(), newSessionId: () => "sid" }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" } }));

import { onSignOutRevoke } from "./auth";

beforeEach(() => revokeSession.mockReset());

describe("onSignOutRevoke", () => {
  it("revokes the Redis sessionId from the JWT on logout", async () => {
    await onSignOutRevoke({ token: { id: "u1", sid: "sid-7" } } as never);
    expect(revokeSession).toHaveBeenCalledWith("u1", "sid-7");
  });

  it("no-ops when there is no token sid", async () => {
    await onSignOutRevoke({ token: null } as never);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/auth-signout.test.ts`
  - Expect FAIL: `onSignOutRevoke` is not exported.

- [ ] **Step 11.2: Implement.**
  - Edit `apps/web/src/lib/auth.ts` — add the import `import { createSession, newSessionId, revokeSession } from "@/lib/session-store";` (extend existing import), add the exported helper above the `NextAuth(...)` call:
```ts
// Exported for unit testing; wired into NextAuth events below.
export async function onSignOutRevoke(message: {
  token?: { id?: string; sid?: string } | null;
}): Promise<void> {
  const t = message.token;
  if (t?.id && t?.sid) await revokeSession(t.id, t.sid);
}
```
  - Add to the `NextAuth({ ... })` options object:
```ts
  events: { signOut: onSignOutRevoke },
```
  - Run: `pnpm --filter web vitest run src/lib/auth-signout.test.ts src/lib/auth.test.ts`
  - Expect PASS (both files green).

- [ ] **Step 11.3: Commit.**
  - `git add -A && git commit -m "phase3: logout revokes Redis sessionId (events.signOut)"`

---

## Task 12: Middleware route guards + security headers (`proxy.ts`)

**Files:** Create `apps/web/proxy.ts`, Create `apps/web/next.config.ts` headers (Modify if present), Test `apps/web/src/lib/security-headers.test.ts`

**Interfaces:** Consumes: `auth` from `@/lib/auth` / Produces: middleware redirecting unauthenticated users from `(dashboard)`/`/admin` → `/login`; CSP + security headers on every response. Helper `buildSecurityHeaders()` unit-tested.

- [ ] **Step 12.1: Write failing test for the header builder.**
  - Create `apps/web/src/lib/security-headers.ts` stub is created in 12.2; first the test:
  - Create `apps/web/src/lib/security-headers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("includes CSP and the standard hardening headers", () => {
    const h = buildSecurityHeaders();
    const names = h.map(([k]) => k.toLowerCase());
    expect(names).toContain("content-security-policy");
    expect(names).toContain("x-content-type-options");
    expect(names).toContain("referrer-policy");
    expect(names).toContain("strict-transport-security");
    expect(names).toContain("x-frame-options");
  });

  it("CSP denies framing and restricts default-src to self", () => {
    const csp = buildSecurityHeaders().find(([k]) => k.toLowerCase() === "content-security-policy")?.[1] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
```
  - Run: `pnpm --filter web vitest run src/lib/security-headers.test.ts`
  - Expect FAIL: `Cannot find module './security-headers'`.

- [ ] **Step 12.2: Implement the header builder.**
  - Create `apps/web/src/lib/security-headers.ts`:
```ts
export function buildSecurityHeaders(): Array<[string, string]> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Next inline bootstrap; tighten with nonce later
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://*.stellar.org",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  return [
    ["Content-Security-Policy", csp],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
    ["X-Frame-Options", "DENY"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ];
}
```
  - Run: `pnpm --filter web vitest run src/lib/security-headers.test.ts`
  - Expect PASS (2 passing).

- [ ] **Step 12.3: Implement `proxy.ts` (guards + headers).**
  - Create `apps/web/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildSecurityHeaders } from "@/lib/security-headers";

// Route groups don't appear in the URL; guard by the concrete paths that live
// under (dashboard) plus /admin. Defense-in-depth only — handlers/pages still
// call requireUser() (AGENT §7: don't rely on middleware alone for authz).
const PROTECTED_PREFIXES = ["/tournaments", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const res =
    isProtected(pathname) && !req.auth
      ? NextResponse.redirect(new URL("/login", req.url))
      : NextResponse.next();

  for (const [k, v] of buildSecurityHeaders()) res.headers.set(k, v);
  return res;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```
  - Note: `/tournaments/[id]` is public-read per SPEC §5; the middleware redirect is a coarse guard, and `/tournaments/[id]` page-level code performs its own public-vs-gated rendering. If a public detail route must bypass the guard, refine `isProtected` to exclude `/tournaments/[id]` GET in Phase 4 — for Phase 3, guarding the group is correct and tests target `/admin` + `/tournaments` list.
  - Run: `pnpm --filter web exec tsc --noEmit` (scope: proxy.ts + security-headers.ts compile clean).
  - Expect: no errors from these files.

- [ ] **Step 12.4: Add static header fallback in `next.config.ts`.**
  - Edit/create `apps/web/next.config.ts` — add an async `headers()` applying `buildSecurityHeaders()` to all routes (belt-and-braces; middleware is primary):
```ts
import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders().map(([key, value]) => ({ key, value })) }];
  },
};

export default nextConfig;
```
  - Run: `pnpm --filter web exec tsc --noEmit` (scope: next.config.ts).
  - Expect: no errors.

- [ ] **Step 12.5: Commit.**
  - `git add -A && git commit -m "phase3: proxy.ts route guards + CSP/security headers"`

---

## Task 13: Login page (brand-styled)

**Files:** Create `apps/web/src/app/(auth)/login/page.tsx`, Create `apps/web/src/app/(auth)/login/login-form.tsx`, Test `apps/web/src/app/(auth)/login/login-form.test.tsx`

**Interfaces:** Consumes: `signIn` from `@/lib/auth`, `credentialsSchema` from `@/lib/auth-schemas` / Produces: client login form (kinetic glass, violet focus, label-caps mono button), generic error on failure.

- [ ] **Step 13.1: Add jsdom + testing-library for component tests.**
  - Run: `pnpm --filter web add -D @testing-library/react @testing-library/user-event jsdom`
  - Edit `apps/web/vitest.config.ts` — set `test.environmentMatchGlobs` or a second project for tsx; simplest: change `environment` to `"jsdom"` and include `src/**/*.test.{ts,tsx}`. (Node-only tests still pass under jsdom.)
  - Run: `pnpm --filter web vitest run --reporter=dot` (all prior tests still green under jsdom).
  - Expect: prior suites PASS.

- [ ] **Step 13.2: Write failing component test (renders + shows generic error).**
  - Create `apps/web/src/app/(auth)/login/login-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();
vi.mock("@/lib/auth-client", () => ({ signIn }));

import { LoginForm } from "./login-form";

beforeEach(() => signIn.mockReset());

describe("LoginForm", () => {
  it("renders username + password fields and a submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("shows a GENERIC error (no field detail) when signIn fails", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "org");
    await userEvent.type(screen.getByLabelText(/password/i), "a-good-enough-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/invalid username or password/i)).toBeTruthy();
  });
});
```
  - Run: `pnpm --filter web vitest run "src/app/(auth)/login/login-form.test.tsx"`
  - Expect FAIL: `Cannot find module './login-form'` (and `@/lib/auth-client`).

- [ ] **Step 13.3: Create the client `signIn` wrapper.**
  - Create `apps/web/src/lib/auth-client.ts`:
```ts
"use client";
export { signIn, signOut } from "next-auth/react";
```

- [ ] **Step 13.4: Implement the login form (BRAND-styled).**
  - Create `apps/web/src/app/(auth)/login/login-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

const GENERIC_ERROR = "Invalid username or password.";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (!res || res.error) {
      setError(GENERIC_ERROR); // never reveal which field
      return;
    }
    router.push("/tournaments");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="kinetic-glass rounded-2xl p-8 w-full max-w-md flex flex-col gap-6"
    >
      <h1 className="font-display text-[32px] leading-[1.2] tracking-[-0.02em] font-bold text-primary">
        Sign in
      </h1>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] uppercase text-on-surface-variant">
          Username
        </span>
        <input
          name="username"
          autoComplete="username"
          required
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-mono text-on-surface focus:outline-none focus:border-electric-violet-strong focus:ring-1 focus:ring-electric-violet-strong"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] uppercase text-on-surface-variant">
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-mono text-on-surface focus:outline-none focus:border-electric-violet-strong focus:ring-1 focus:ring-electric-violet-strong"
        />
      </label>

      {error && (
        <p role="alert" className="font-mono text-[14px] text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-electric-violet-strong text-[#0A0A0B] font-mono text-[12px] tracking-[0.1em] uppercase font-bold rounded-lg px-6 py-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```
  - Create `apps/web/src/app/(auth)/login/page.tsx`:
```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <LoginForm />
    </main>
  );
}
```
  - Update the test mock target: the test mocks `@/lib/auth-client`; ensure the form imports from `@/lib/auth-client` (it does).
  - Run: `pnpm --filter web vitest run "src/app/(auth)/login/login-form.test.tsx"`
  - Expect PASS (2 passing).

- [ ] **Step 13.5: Commit.**
  - `git add -A && git commit -m "phase3: brand-styled login page + generic-error form"`

---

## Task 14: Register page (brand-styled)

**Files:** Create `apps/web/src/app/(auth)/register/page.tsx`, Create `apps/web/src/app/(auth)/register/register-form.tsx`, Test `apps/web/src/app/(auth)/register/register-form.test.tsx`

**Interfaces:** Consumes: `credentialsSchema` from `@/lib/auth-schemas`, `signIn` from `@/lib/auth-client`, `POST /api/auth/register` / Produces: client register form (kinetic glass, violet focus, label-caps mono button) sharing the Zod schema; generic error.

- [ ] **Step 14.1: Write failing component test (client-side Zod validation + generic server error).**
  - Create `apps/web/src/app/(auth)/register/register-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();
vi.mock("@/lib/auth-client", () => ({ signIn }));

import { RegisterForm } from "./register-form";

beforeEach(() => {
  signIn.mockReset();
  vi.restoreAllMocks();
});

describe("RegisterForm", () => {
  it("blocks a too-short password client-side (shared Zod schema), no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "newbie");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/at least 10 characters/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the server's generic error on a 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Could not create account" }), { status: 409 }),
    );
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "taken");
    await userEvent.type(screen.getByLabelText(/password/i), "a-good-enough-password");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/could not create account/i)).toBeTruthy();
  });
});
```
  - Run: `pnpm --filter web vitest run "src/app/(auth)/register/register-form.test.tsx"`
  - Expect FAIL: `Cannot find module './register-form'`.

- [ ] **Step 14.2: Implement the register form (BRAND-styled, shared schema).**
  - Create `apps/web/src/app/(auth)/register/register-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { credentialsSchema } from "@/lib/auth-schemas";
import { signIn } from "@/lib/auth-client";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    // Shared Zod validation (same schema the server enforces).
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setPending(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setPending(false);
      setError(json.error ?? "Could not create account");
      return;
    }

    // Auto sign-in after successful registration.
    await signIn("credentials", { ...parsed.data, redirect: false });
    router.push("/tournaments");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="kinetic-glass rounded-2xl p-8 w-full max-w-md flex flex-col gap-6"
    >
      <h1 className="font-display text-[32px] leading-[1.2] tracking-[-0.02em] font-bold text-primary">
        Create your account
      </h1>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] uppercase text-on-surface-variant">
          Username
        </span>
        <input
          name="username"
          autoComplete="username"
          required
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-mono text-on-surface focus:outline-none focus:border-electric-violet-strong focus:ring-1 focus:ring-electric-violet-strong"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] uppercase text-on-surface-variant">
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-mono text-on-surface focus:outline-none focus:border-electric-violet-strong focus:ring-1 focus:ring-electric-violet-strong"
        />
      </label>

      {error && (
        <p role="alert" className="font-mono text-[14px] text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-electric-violet-strong text-[#0A0A0B] font-mono text-[12px] tracking-[0.1em] uppercase font-bold rounded-lg px-6 py-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
```
  - Create `apps/web/src/app/(auth)/register/page.tsx`:
```tsx
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <RegisterForm />
    </main>
  );
}
```
  - Run: `pnpm --filter web vitest run "src/app/(auth)/register/register-form.test.tsx"`
  - Expect PASS (2 passing).

- [ ] **Step 14.3: Commit.**
  - `git add -A && git commit -m "phase3: brand-styled register page sharing Zod schema"`

---

## Task 15: Integration tests vs test Postgres + Redis

**Files:** Create `apps/web/src/app/api/auth/auth-flow.integration.test.ts`, Modify `apps/web/vitest.config.ts` (integration project), Modify `package.json` test scripts

**Interfaces:** Consumes: real `prisma` (`@/lib/db`), real `redis` (`@/lib/redis`) against the docker-compose Postgres + Redis / Produces: end-to-end coverage of register → login → me → revoke → me-401, plus rate-limit + CSRF enforcement.

- [ ] **Step 15.1: Add an integration vitest project that does NOT mock db/redis.**
  - Create `apps/web/vitest.integration.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
  - Add to `apps/web/package.json` scripts: `"test:integration": "vitest run -c vitest.integration.config.ts"` and ensure unit `"test": "vitest run"` excludes `*.integration.test.ts` (set `exclude: ["**/*.integration.test.ts", "node_modules/**"]` in `vitest.config.ts`).

- [ ] **Step 15.2: Write the integration test (register → login token → me → revoke → 401; rate-limit; CSRF).**
  - Create `apps/web/src/app/api/auth/auth-flow.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { POST as register } from "@/app/api/auth/register/route";
import { authorizeCredentials } from "@/lib/auth";
import { createSession, isSessionValid, revokeSession, newSessionId } from "@/lib/session-store";

const USERNAME = `it_user_${Date.now()}`;
const PASSWORD = "a-good-enough-password";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: "it_user_" } } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: "it_user_" } } });
  await redis.flushdb();
  await redis.quit();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await redis.flushdb();
});

describe("auth flow (integration: Postgres + Redis)", () => {
  it("registers an ORGANIZER persisted in Postgres", async () => {
    const res = await register(req({ username: USERNAME, password: PASSWORD }));
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { username: USERNAME } });
    expect(user?.role).toBe("ORGANIZER");
    expect(user?.passwordHash).not.toBe(PASSWORD);
  });

  it("authorizes with correct credentials and rejects wrong ones (generic)", async () => {
    const okUser = await authorizeCredentials({ username: USERNAME, password: PASSWORD });
    expect(okUser?.username).toBe(USERNAME);
    expect(await authorizeCredentials({ username: USERNAME, password: "nope-nope-nope" })).toBeNull();
    expect(await authorizeCredentials({ username: "does_not_exist", password: PASSWORD })).toBeNull();
  });

  it("revocation invalidates a live session", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { username: USERNAME } });
    const sid = newSessionId();
    await createSession(u.id, sid, 3600);
    expect(await isSessionValid(u.id, sid)).toBe(true);
    await revokeSession(u.id, sid);
    expect(await isSessionValid(u.id, sid)).toBe(false);
  });

  it("rejects a duplicate registration with a generic 409", async () => {
    const res = await register(req({ username: USERNAME, password: PASSWORD }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Could not create account");
  });

  it("enforces the per-IP rate limit on register", async () => {
    let last = 200;
    for (let i = 0; i < 7; i++) {
      const r = await register(req({ username: `it_user_rl_${i}`, password: PASSWORD }, { "x-forwarded-for": "9.9.9.9" }));
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("rejects a cross-origin register (CSRF)", async () => {
    const res = await register(req({ username: "it_user_csrf", password: PASSWORD }, { origin: "http://evil.example" }));
    expect(res.status).toBe(403);
  });
});
```
  - Run (with `docker compose up -d postgres redis` and a migrated test DB): `pnpm --filter web test:integration`
  - Expect FAIL first if any wiring is off; iterate per superpowers:systematic-debugging until green.

- [ ] **Step 15.3: Run the full suite green.**
  - Run: `pnpm --filter web vitest run` (unit) and `pnpm --filter web test:integration`
  - Expect: all PASS; typecheck clean: `pnpm --filter web exec tsc --noEmit`.

- [ ] **Step 15.4: Commit.**
  - `git add -A && git commit -m "phase3: auth-flow integration tests vs Postgres + Redis"`

---

## Phase 3 Definition of Done (verify before claiming complete)

Use superpowers:verification-before-completion — run each command, confirm output, before asserting done.

- [ ] Register/login/logout/me all work (`pnpm --filter web vitest run` + `test:integration` green).
- [ ] Protected routes redirect unauthenticated users → `/login` (proxy.ts guard; `requireUser` redirect test).
- [ ] Revocation invalidates a live session (session-store + auth-guards + integration tests prove it).
- [ ] Rate limit enforced on login + register, per-IP and per-user (rate-limit unit + register route + integration tests).
- [ ] CSRF enforced on cookie-authenticated mutations (csrf unit + register route + integration tests).
- [ ] Security headers/CSP present (security-headers unit; proxy.ts + next.config wiring).
- [ ] argon2id hashing; generic auth errors everywhere (no enumeration); no password material logged or returned.
- [ ] Roles ADMIN/ORGANIZER enforced server-side via `requireUser` (never from client).
- [ ] `pnpm --filter web exec tsc --noEmit` clean; `pnpm audit` reviewed.

## Self-review map (SPEC §7 + AGENT §7 → Task)

| Requirement | Task |
|---|---|
| argon2id hashing | Task 2 |
| httpOnly + Secure + SameSite=Lax cookie | Task 7 (cookie options) |
| Redis-backed revocation of a live session | Tasks 4, 8, 11, 15 |
| Generic auth errors / no enumeration | Tasks 7, 9, 13, 14 |
| Rate-limit login + register (per-IP + per-user) | Tasks 5, 9 (+ login via NextAuth bounded by same limiter pattern; see note) |
| CSRF (same-site + origin/host check) | Tasks 6, 9 |
| Security headers + CSP | Task 12 |
| Middleware guard `(dashboard)` + `/admin` → `/login` | Task 12 |
| Don't rely on middleware alone for authz | Task 8 (`requireUser` per handler) |
| Roles ADMIN/ORGANIZER | Tasks 0 (types), 7, 8 |
| register + me routes | Tasks 9, 10 |
| Never log password material | Tasks 2, 9 (no logging of secrets anywhere) |

> **Login rate-limit note:** NextAuth's Credentials `authorize` runs server-side; add a per-IP + per-username `rateLimit` call at the **top of `authorizeCredentials`** (returning `null` when blocked) so login is throttled identically to register. This is a one-line addition in Task 7's `authorizeCredentials` — include it when implementing: read the client IP from `headers()` (`next/headers`) inside `authorize`, key on `login:ip:<ip>` and `login:user:<username>`, and on `!ok` return `null` (generic). Add a corresponding unit test mirroring Task 5's "Nth call blocks".
