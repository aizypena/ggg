import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: vi.fn(async () => 4),
      // LIMITATION NOTE: The service uses `{ ...u }` spread on the prisma result, so any
      // field the mock returns — including `passwordHash` — would be spread into the output.
      // This means a prisma-layer mock CANNOT prove exclusion: if `passwordHash` were added
      // here, the "does not include passwordHash" test below would FAIL (not because the real
      // code is wrong, but because the mock bypasses Prisma's `select` allowlist).
      // The real exclusion guarantee is the explicit `select` in admin.ts:
      //   select: { id: true, username: true, role: true, createdAt: true }
      // That `select` ensures passwordHash is never fetched from the DB in production.
      // The "does not include passwordHash" assertion below is therefore a shape-contract check
      // (the mock omits passwordHash, reflecting what Prisma's select would return).
      findMany: vi.fn(async () => [
        { id: "u1", username: "admin", role: "ADMIN", createdAt: new Date(0) },
      ]),
    },
    tournament: {
      groupBy: vi.fn(async () => [{ status: "ACTIVE", _count: { _all: 2 } }]),
    },
  },
}));

import { getAdminOverview } from "./admin";

describe("getAdminOverview", () => {
  it("returns counts and users", async () => {
    const o = await getAdminOverview();
    expect(o.userCount).toBe(4);
    expect(o.byStatus.ACTIVE).toBe(2);
    expect(o.users[0]!.username).toBe("admin");
  });

  it("initialises zero counts for statuses not returned by groupBy", async () => {
    const o = await getAdminOverview();
    expect(o.byStatus.DRAFT).toBe(0);
    expect(o.byStatus.FINISHED).toBe(0);
    expect(o.byStatus.CANCELLED).toBe(0);
  });

  it("serialises createdAt to ISO string", async () => {
    const o = await getAdminOverview();
    expect(typeof o.users[0]!.createdAt).toBe("string");
    expect(o.users[0]!.createdAt).toBe(new Date(0).toISOString());
  });

  it("does not include passwordHash in returned users", async () => {
    const o = await getAdminOverview();
    for (const u of o.users) {
      expect(u).not.toHaveProperty("passwordHash");
    }
  });
});
