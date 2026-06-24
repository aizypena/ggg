import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { createTournamentSchema } from "@/lib/validation/tournament";
import { createTournament } from "@/server/services/tournaments";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: must be an authenticated ORGANIZER.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser("ORGANIZER");
  } catch {
    return err("UNAUTHORIZED", "Authentication required", 401);
  }

  // 3. Rate-limit per user.
  const rl = await rateLimit(`create_tournament:${user.id}`, { limit: 10, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 4. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = createTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // 5. Delegate to service.
  const data = await createTournament(parsed.data, user.id);

  // 6. Serialize BigInt fields to string in the response envelope.
  return ok(
    {
      tournamentId: data.tournamentId,
      unsignedXdr: data.unsignedXdr,
      network: data.network,
    },
    201,
  );
}
