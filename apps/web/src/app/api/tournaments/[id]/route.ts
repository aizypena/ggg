import { ok, err } from "@/lib/api";
import { getTournamentDetail } from "@/server/services/tournaments";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const data = await getTournamentDetail(id);
  if (!data) return err("NOT_FOUND", "Tournament not found", 404);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { organizerId: _organizerId, ...publicData } = data;
  return ok(publicData);
}
