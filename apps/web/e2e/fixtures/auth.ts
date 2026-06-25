import type { BrowserContext } from "@playwright/test";

/**
 * Registers + logs in a user through the real /api/auth/* routes so the browser
 * context carries a genuine session cookie. Used by the E2E specs to act as an
 * authenticated organiser.
 */
export async function registerAndLogin(ctx: BrowserContext, username: string, password: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  await ctx.request.post(`${base}/api/auth/register`, {
    data: { username, password },
  });
  const res = await ctx.request.post(`${base}/api/auth/login`, {
    data: { username, password },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  // session cookie now stored in ctx
}
