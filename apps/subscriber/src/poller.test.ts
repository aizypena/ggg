import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getEvents,
  decodeScVal,
  getCursor,
  setCursor,
  applyEvent,
  reconcileSep7Deposits,
  publishChange,
} = vi.hoisted(() => ({
  getEvents: vi.fn(),
  decodeScVal: vi.fn(),
  getCursor: vi.fn(),
  setCursor: vi.fn(),
  applyEvent: vi.fn(),
  reconcileSep7Deposits: vi.fn(async () => ({ changes: [], nextCursor: "p1" })),
  publishChange: vi.fn(),
}));

vi.mock("./stellar", () => ({ getEvents, decodeScVal, getContractPayments: vi.fn() }));
vi.mock("./cursor", () => ({ getCursor, setCursor }));
vi.mock("./reconcile", () => ({ applyEvent }));
vi.mock("./horizon-sep7", () => ({ reconcileSep7Deposits }));
vi.mock("./publish", () => ({ publishChange }));

import { pollTournament } from "./poller";

const tournament = { id: "t1", contractId: "CABC" };

beforeEach(() => {
  getCursor.mockResolvedValue({ ledger: 100, hzCursor: null });
  getEvents.mockResolvedValue({
    latestLedger: 300,
    events: [
      { type: "contract", ledger: 105, txHash: "tx-reg-1", topic: ["REG", "PLY"], value: "VAL" },
    ],
  });
  // topic[0] → the "registered" symbol, topic[1] → the player address; the value
  // decodes to the post-join pool total (a bare i128).
  decodeScVal.mockImplementation((b64: string) => {
    if (b64 === "REG") return "registered";
    if (b64 === "PLY") return "GPLAYER1";
    return 10000000n;
  });
  applyEvent.mockResolvedValue({
    type: "REGISTERED",
    txHash: "tx-reg-1",
    data: { player: "GPLAYER1", poolAfter: "10000000" },
  });
  reconcileSep7Deposits.mockResolvedValue({ changes: [], nextCursor: "p1" });
  setCursor.mockReset();
  publishChange.mockReset();
});

describe("pollTournament", () => {
  it("ingests a registered event, publishes it, and advances the cursor", async () => {
    await pollTournament(tournament);
    expect(applyEvent).toHaveBeenCalledTimes(1);
    expect(applyEvent.mock.calls[0]?.[1]).toMatchObject({
      type: "REGISTERED",
      txHash: "tx-reg-1",
      ledger: 105,
    });
    expect(publishChange).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ type: "REGISTERED", txHash: "tx-reg-1" }),
    );
    expect(setCursor).toHaveBeenCalledWith("CABC", 201, "p1"); // latestLedger + 1 - SAFETY_LAG(100), hz cursor advanced
  });

  it("does not publish a duplicate (applyEvent returns null on replay)", async () => {
    applyEvent.mockResolvedValue(null);
    await pollTournament(tournament);
    expect(publishChange).not.toHaveBeenCalled();
    expect(setCursor).toHaveBeenCalledWith("CABC", 201, "p1");
  });
});
