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
