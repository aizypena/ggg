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
  it("polls every ACTIVE tournament with a contractId", async () => {
    findMany.mockResolvedValue([
      { id: "t1", contractId: "C1" },
      { id: "t2", contractId: "C2" },
    ]);
    pollTournament.mockResolvedValue([]);
    await tick();
    expect(pollTournament).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", contractId: { not: null } },
      select: { id: true, contractId: true },
    });
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
