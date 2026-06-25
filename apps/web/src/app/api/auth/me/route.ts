import { getCurrentUser } from "@/lib/auth-guards";
import { ok, err } from "@/lib/api";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return err("UNAUTHORIZED", "Not authenticated", 401);
  return ok(user);
}
