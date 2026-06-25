import { prisma } from "./db";
import { pollTournament } from "./poller";
import { env } from "./env";

/**
 * One poll pass over every ACTIVE tournament that has a deployed contract.
 * A failure polling one tournament is logged and isolated so the others still
 * run (and so the loop survives a transient RPC/Horizon outage).
 */
export async function tick(): Promise<void> {
  const tournaments = await prisma.tournament.findMany({
    where: { status: "ACTIVE", contractId: { not: null } },
    select: { id: true, contractId: true },
  });
  for (const t of tournaments) {
    if (!t.contractId) continue;
    try {
      await pollTournament({ id: t.id, contractId: t.contractId });
    } catch (err) {
      console.error(`[subscriber] poll failed for ${t.id}`, err);
    }
  }
}

async function main(): Promise<void> {
  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  console.log("[subscriber] started");
  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, env.POLL_INTERVAL_MS));
  }
  await prisma.$disconnect();
  console.log("[subscriber] stopped");
}

// Only run the loop when executed directly (not when imported by tests).
if (process.env.VITEST === undefined) {
  main().catch((err: unknown) => {
    console.error("[subscriber] fatal", err);
    process.exit(1);
  });
}
