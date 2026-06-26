import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, pollTournament } = vi.hoisted(() => ({
  findMany: vi.fn(),
  pollTournament: vi.fn(),
}));
vi.mock("./db", () => ({ prisma: { tournament: { findMany } } }));
vi.mock("./poller", () => ({ pollTournament }));

import { tick } from "./index";

beforeEach(() => {
  findMany.mockReset();
  pollTournament.mockReset();
});

describe("tick", () => {
  it("polls ACTIVE plus recently-terminal tournaments with a contractId", async () => {
    findMany.mockResolvedValue([
      { id: "t1", contractId: "C1" },
      { id: "t2", contractId: "C2" },
    ]);
    pollTournament.mockResolvedValue([]);
    await tick();
    expect(pollTournament).toHaveBeenCalledTimes(2);
    // Discovers ACTIVE tournaments plus FINISHED/CANCELLED ones still inside the
    // grace window, so the terminal finalize/cancel event still gets reconciled.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contractId: { not: null },
          OR: expect.arrayContaining([
            { status: "ACTIVE" },
            expect.objectContaining({ status: "FINISHED" }),
            expect.objectContaining({ status: "CANCELLED" }),
          ]),
        }),
        select: { id: true, contractId: true },
      }),
    );
  });

  it("isolates a failing tournament (one throws, the other still polls)", async () => {
    findMany.mockResolvedValue([
      { id: "t1", contractId: "C1" },
      { id: "t2", contractId: "C2" },
    ]);
    pollTournament.mockRejectedValueOnce(new Error("rpc down")).mockResolvedValueOnce([]);
    await expect(tick()).resolves.toBeUndefined();
    expect(pollTournament).toHaveBeenCalledTimes(2);
  });
});
