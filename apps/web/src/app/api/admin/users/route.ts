import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { adminListQuerySchema } from "@/lib/validation/admin";
import { listUsers } from "@/server/services/admin";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireUser("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }

  const q = adminListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return err("INVALID_REQUEST", q.error.issues[0]?.message ?? "Invalid query", 400);
  }

  return ok(await listUsers(q.data));
}
