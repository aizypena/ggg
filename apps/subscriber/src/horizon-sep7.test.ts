import { describe, it, expect, vi, beforeEach } from "vitest";

const { getContractPayments, applyEvent } = vi.hoisted(() => ({
  getContractPayments: vi.fn(),
  applyEvent:
    vi.fn<
      (
        t: unknown,
        e: { type: string; txHash: string; data: unknown },
      ) => Promise<{ type: string; txHash: string; data: unknown } | null>
    >(),
}));

vi.mock("./stellar", () => ({ getContractPayments }));
vi.mock("./reconcile", () => ({ applyEvent }));

import { reconcileSep7Deposits } from "./horizon-sep7";

const tournament = { id: "t1", contractId: "CABC" };

beforeEach(() => {
  getContractPayments.mockReset();
  applyEvent.mockReset();
  applyEvent.mockImplementation(async (_t, e) => ({
    type: e.type,
    txHash: e.txHash,
    data: e.data,
  }));
});

describe("reconcileSep7Deposits", () => {
  it("reconciles only the deposit whose memo == tournamentId", async () => {
    getContractPayments.mockResolvedValue({
      payments: [
        {
          transaction_hash: "tx-dep-1",
          from: "GDEPOSITOR",
          to: "CABC",
          amount: "10000000",
          memo: "t1",
          paging_token: "p1",
        },
        {
          transaction_hash: "tx-dep-2",
          from: "GOTHER",
          to: "CABC",
          amount: "10000000",
          memo: "WRONG",
          paging_token: "p2",
        },
      ],
      nextCursor: "p2",
    });
    const { changes, nextCursor } = await reconcileSep7Deposits(tournament, null);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "REGISTERED", txHash: "tx-dep-1" });
    expect(applyEvent).toHaveBeenCalledTimes(1);
    expect(applyEvent.mock.calls[0]?.[1]).toMatchObject({
      type: "REGISTERED",
      txHash: "tx-dep-1",
      data: { player: "GDEPOSITOR" },
    });
    expect(nextCursor).toBe("p2");
  });

  it("is idempotent — applyEvent returning null (already seen) drops the change", async () => {
    applyEvent.mockResolvedValueOnce(null);
    getContractPayments.mockResolvedValue({
      payments: [
        {
          transaction_hash: "tx-dep-1",
          from: "GDEPOSITOR",
          to: "CABC",
          amount: "10000000",
          memo: "t1",
          paging_token: "p1",
        },
      ],
      nextCursor: "p1",
    });
    const { changes } = await reconcileSep7Deposits(tournament, null);
    expect(changes).toHaveLength(0);
  });
});
