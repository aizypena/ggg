import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const channelFor = (id: string): string => `tournament:${id}`;
const sseFrame = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);

  // Polling fallback: return the recent confirmed rows as JSON, no stream.
  if (url.searchParams.get("fallback") === "poll") {
    const rows = await prisma.contractEvent.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(
      rows.reverse().map((ev) => ({ type: ev.type, txHash: ev.txHash, data: ev.payload })),
    );
  }

  // Dedicated connection for pub/sub (a subscribed ioredis client can't run
  // other commands). Redis is ephemeral — we replay confirmed rows from
  // Postgres (the source of truth) before streaming live messages.
  const sub = redis.duplicate();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const recent = await prisma.contractEvent.findMany({
        where: { tournamentId: id },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const ev of recent) {
        controller.enqueue(
          encoder.encode(sseFrame({ type: ev.type, txHash: ev.txHash, data: ev.payload })),
        );
      }
      controller.enqueue(encoder.encode(": connected\n\n"));

      sub.on("message", (_channel: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(JSON.parse(message))));
        } catch {
          /* drop malformed */
        }
      });
      await sub.subscribe(channelFor(id));

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        void sub.unsubscribe(channelFor(id));
        void sub.quit();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
