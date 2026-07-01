import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { getAdminOverview } from "@/server/services/admin";

export async function GET(): Promise<Response> {
  try {
    await requireUser("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }

  return ok(await getAdminOverview());
}
