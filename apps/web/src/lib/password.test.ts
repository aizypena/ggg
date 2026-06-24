import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, passwordSchema } from "./password";

describe("password util", () => {
  it("produces an argon2id hash that is not the plaintext", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(hash).not.toBe("Sup3r-Secret!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(await verifyPassword(hash, "Sup3r-Secret!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("verify returns false on a malformed hash rather than throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("enforces the password policy (min length)", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a-good-enough-password").success).toBe(true);
  });
});
