import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError, type SessionUser } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { adminUpdateTournamentSchema } from "@/lib/validation/admin";
import { getTournamentAdminDetail, updateTournament } from "@/server/services/admin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function guardAdmin(): Promise<SessionUser | Response> {
  try {
    return await requireUser("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const guard = await guardAdmin();
  if (guard instanceof Response) return guard;
  void guard;

  const { id } = await params;
  const tournament = await getTournamentAdminDetail(id);
  if (!tournament) return err("NOT_FOUND", "Tournament not found", 404);
  return ok(tournament);
}

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  const guard = await guardAdmin();
  if (guard instanceof Response) return guard;
  const user = guard;

  const rl = await rateLimit(`admin:update_tournament:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }

  const parsed = adminUpdateTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  try {
    await updateTournament(id, parsed.data);
    return ok({ updated: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not update tournament", 500);
  }
}
