import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, { contractId: string; ledger: number; hzCursor: string | null }>();
vi.mock("./db", () => ({
  prisma: {
    subscriberCursor: {
      findUnique: vi.fn(
        async ({ where }: { where: { contractId: string } }) => store.get(where.contractId) ?? null,
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { contractId: string };
          create: { contractId: string; ledger: number; hzCursor: string | null };
          update: Partial<{ ledger: number; hzCursor: string }>;
        }) => {
          const prev = store.get(where.contractId);
          const next = prev ? { ...prev, ...update } : create;
          store.set(where.contractId, next);
          return next;
        },
      ),
    },
  },
}));

import { getCursor, setCursor } from "./cursor";

beforeEach(() => store.clear());

describe("cursor", () => {
  it("returns ledger 0 / null when no cursor exists", async () => {
    const c = await getCursor("CABC");
    expect(c).toEqual({ ledger: 0, hzCursor: null });
  });

  it("persists and recovers a cursor across reads (restart simulation)", async () => {
    await setCursor("CABC", 142, "tok-9");
    const recovered = await getCursor("CABC");
    expect(recovered).toEqual({ ledger: 142, hzCursor: "tok-9" });
  });

  it("advances only the ledger, preserving hzCursor", async () => {
    await setCursor("CABC", 142, "tok-9");
    await setCursor("CABC", 200);
    const c = await getCursor("CABC");
    expect(c.ledger).toBe(200);
    expect(c.hzCursor).toBe("tok-9");
  });
});
