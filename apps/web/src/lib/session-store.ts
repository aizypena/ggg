import { randomBytes } from "node:crypto";
import { redis } from "@/lib/redis";

// Allow-list model: a session is only valid while its key exists in Redis.
// Deleting the key (revoke) invalidates a live cookie on the next request.
const key = (userId: string, sid: string) => `session:${userId}:${sid}`;
const userPattern = (userId: string) => `session:${userId}:*`;

export function newSessionId(): string {
  return randomBytes(24).toString("hex");
}

export async function createSession(userId: string, sid: string, ttlSec: number): Promise<void> {
  await redis.set(key(userId, sid), "1", "EX", ttlSec);
}

export async function isSessionValid(userId: string, sid: string): Promise<boolean> {
  if (!userId || !sid) return false;
  return (await redis.exists(key(userId, sid))) === 1;
}

export async function revokeSession(userId: string, sid: string): Promise<void> {
  await redis.del(key(userId, sid));
}

export async function revokeAllForUser(userId: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", userPattern(userId), "COUNT", 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
}
