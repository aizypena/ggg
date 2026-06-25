import { z } from "zod";

/**
 * Password validation schema — pure Zod, no server-only deps.
 *
 * Kept separate from `password.ts` (which imports `argon2`, a native Node
 * module) so client components can import this via `auth-schemas.ts` without
 * dragging argon2 / `fs` into the browser bundle.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password is too long");
