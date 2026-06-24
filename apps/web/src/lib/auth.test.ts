import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/session-store", () => ({
  createSession: vi.fn(),
  newSessionId: () => "sid-fixed",
}));

import { prisma } from "@/lib/db";
import { hashPassword } from "./password";
import { authorizeCredentials } from "./auth";

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findUnique.mockReset();
});

describe("authorizeCredentials", () => {
  it("returns the user (without hash) on correct password", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      username: "organiser",
      role: "ORGANIZER",
      passwordHash: await hashPassword("a-good-enough-password"),
    });
    const user = await authorizeCredentials({ username: "organiser", password: "a-good-enough-password" });
    expect(user).toEqual({ id: "u1", username: "organiser", role: "ORGANIZER" });
  });

  it("returns null on wrong password (generic, no enumeration)", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      username: "organiser",
      role: "ORGANIZER",
      passwordHash: await hashPassword("a-good-enough-password"),
    });
    expect(await authorizeCredentials({ username: "organiser", password: "WRONG" })).toBeNull();
  });

  it("returns null when the user does not exist (same shape as wrong password)", async () => {
    findUnique.mockResolvedValue(null);
    expect(await authorizeCredentials({ username: "ghost", password: "a-good-enough-password" })).toBeNull();
  });

  it("returns null on malformed input", async () => {
    expect(await authorizeCredentials({ username: "", password: "" })).toBeNull();
  });
});
