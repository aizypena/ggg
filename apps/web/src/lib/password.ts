import argon2 from "argon2";

// Re-export the client-safe schema so existing `@/lib/password` importers keep
// working; it lives in password-schema.ts (no argon2) so client bundles never
// pull argon2/`fs` in through auth-schemas.ts.
export { passwordSchema } from "./password-schema";

// argon2id with sensible memory/time params (AGENT §7).
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // fail closed on malformed hash; never throw to caller
  }
}
