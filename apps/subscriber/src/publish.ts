import { redis } from "./redis";
import type { Change } from "./reconcile";

export const channelFor = (tournamentId: string): string => `tournament:${tournamentId}`;

/** Publish a confirmed change as JSON to the tournament's Redis channel. */
export async function publishChange(tournamentId: string, payload: Change): Promise<void> {
  await redis.publish(channelFor(tournamentId), JSON.stringify(payload));
}
