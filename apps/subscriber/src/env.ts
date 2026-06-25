import { z } from "zod";

/**
 * Subscriber environment loader — mirrors apps/web/src/lib/env.ts (lazy,
 * fail-closed) but scoped to the keys the worker needs. Validation is lazy so
 * unit tests that import pure helpers don't trip on an incomplete process.env.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string().min(1),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;
function loadEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in loadEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(loadEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(loadEnv(), prop);
  },
});
