import type { BrowserContext } from "@playwright/test";

const base = (): string => process.env.APP_URL ?? "http://localhost:3000";

/**
 * Registers + logs a user in through the **real** auth routes so the browser
 * context carries a genuine `ggg.session` cookie. Used by the E2E specs to act
 * as an authenticated organiser/referee.
 *
 * Login goes through the NextAuth credentials flow — there is no `/api/auth/login`
 * route. NextAuth v4 requires a CSRF token (`GET /api/auth/csrf`) submitted with
 * the credentials to `POST /api/auth/callback/credentials` as form-encoded data;
 * `json: "true"` makes it return `{ url }` instead of a 302 redirect.
 */
export async function registerAndLogin(
  ctx: BrowserContext,
  username: string,
  password: string,
): Promise<void> {
  const origin = base();

  // 1. Register. Idempotent across reruns: 409 means the user already exists.
  //    The route enforces same-origin, so send a matching Origin header.
  const reg = await ctx.request.post(`${origin}/api/auth/register`, {
    headers: { origin, "content-type": "application/json" },
    data: { username, password },
  });
  if (!reg.ok() && reg.status() !== 409) {
    throw new Error(`register failed: ${reg.status()} ${await reg.text()}`);
  }

  // 2. NextAuth credentials login: CSRF token → callback.
  const csrfRes = await ctx.request.get(`${origin}/api/auth/csrf`);
  if (!csrfRes.ok()) throw new Error(`csrf fetch failed: ${csrfRes.status()}`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const login = await ctx.request.post(`${origin}/api/auth/callback/credentials`, {
    headers: { origin },
    form: { csrfToken, username, password, callbackUrl: origin, json: "true" },
  });
  if (!login.ok()) throw new Error(`login POST failed: ${login.status()} ${await login.text()}`);

  // 3. NextAuth returns 200 even on bad credentials (with ?error= in the url),
  //    so confirm the session actually established via the authenticated route.
  const me = await ctx.request.get(`${origin}/api/auth/me`);
  if (!me.ok()) {
    throw new Error(`session not established after login: /api/auth/me → ${me.status()}`);
  }
  // The `ggg.session` cookie now lives in the context's cookie jar.
}
