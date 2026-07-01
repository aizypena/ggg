import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError, type SessionUser } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { adminUpdateUserSchema } from "@/lib/validation/admin";
import { getUserAdminDetail, updateUser, deleteUser } from "@/server/services/admin";

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
  const user = await getUserAdminDetail(id);
  if (!user) return err("NOT_FOUND", "User not found", 404);
  return ok(user);
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

  const rl = await rateLimit(`admin:update_user:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }

  const parsed = adminUpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  try {
    const result = await updateUser(id, parsed.data, user);
    return ok(result);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not update user", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  const guard = await guardAdmin();
  if (guard instanceof Response) return guard;
  const user = guard;

  const rl = await rateLimit(`admin:delete_user:${user.id}`, { limit: 10, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  const { id } = await params;

  try {
    await deleteUser(id, user.id);
    return ok({ deleted: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not delete user", 500);
  }
}
