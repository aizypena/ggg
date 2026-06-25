import { z } from "zod";
import { passwordSchema } from "@/lib/password-schema";

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(64, "Username is too long")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, _ . -"),
  password: passwordSchema,
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
