import { describe, it, expect } from "vitest";
import { credentialsSchema } from "./auth-schemas";

describe("credentialsSchema", () => {
  it("accepts a valid username + password", () => {
    const r = credentialsSchema.safeParse({
      username: "organiser_1",
      password: "a-good-enough-password",
    });
    expect(r.success).toBe(true);
  });
  it("rejects an empty username", () => {
    expect(
      credentialsSchema.safeParse({ username: "", password: "a-good-enough-password" }).success,
    ).toBe(false);
  });
  it("rejects a too-short password", () => {
    expect(credentialsSchema.safeParse({ username: "ok", password: "short" }).success).toBe(false);
  });
});
