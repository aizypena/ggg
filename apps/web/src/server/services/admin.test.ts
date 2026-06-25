import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: vi.fn(async () => 4),
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
