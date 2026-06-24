import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeRpc, errorSim, txStatus } from "./__mocks__/rpc";
import { StellarError } from "./errors";

const rpcRef: { current: ReturnType<typeof makeFakeRpc> } = { current: makeFakeRpc() };
vi.mock("./client", () => ({
  getRpc: () => rpcRef.current,
  networkPassphrase: () => "Test SDF Network ; September 2015",
}));

// assembleTransaction returns a tx whose .toXDR() is deterministic
vi.mock("@stellar/stellar-sdk", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    rpc: {
      ...(actual.rpc as object),
      assembleTransaction: vi.fn(() => ({ build: () => ({ toXDR: () => "ASSEMBLED_XDR" }) })),
      Api: { isSimulationError: (s: { error?: string }) => "error" in s && !!s.error },
    },
    TransactionBuilder: {
      fromXDR: vi.fn(() => ({ hash: () => Buffer.from("HASH") })),
    },
  };
});

beforeEach(() => {
  rpcRef.current = makeFakeRpc();
});

describe("simulateAndAssemble", () => {
  it("returns assembled tx when simulation succeeds", async () => {
    const { simulateAndAssemble } = await import("./pipeline");
    const out = await simulateAndAssemble({} as never);
    expect(out.toXDR()).toBe("ASSEMBLED_XDR");
    expect(rpcRef.current.simulateTransaction).toHaveBeenCalledOnce();
  });
  it("throws SIMULATION_FAILED when simulation errors", async () => {
    rpcRef.current = makeFakeRpc({ simulateTransaction: errorSim("boom") });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
  });
});

describe("submitSignedXdr", () => {
  it("submits and polls until SUCCESS, returning hash", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
      getTransaction: txStatus("SUCCESS"),
    });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res).toMatchObject({ hash: "HASH", status: "SUCCESS" });
  });
  it("returns FAILED status when getTransaction is FAILED", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("FAILED") });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res.status).toBe("FAILED");
  });
  it("throws SUBMIT_FAILED when sendTransaction errors", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "ERROR", errorResult: "nope" }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
    });
  });
  it("throws TX_TIMEOUT when polling never leaves NOT_FOUND", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("NOT_FOUND") });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(
      submitSignedXdr("AAAAAgAAAAA=", "join", { attempts: 2, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT" });
  });
  it("rejects malformed XDR before submitting", async () => {
    const send = vi.fn();
    rpcRef.current = makeFakeRpc({ sendTransaction: send });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("!!!", "join")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(send).not.toHaveBeenCalled();
  });
});
