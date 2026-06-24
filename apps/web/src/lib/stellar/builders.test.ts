import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

const built = (xdr: string) => ({ toXDR: () => xdr });
const joinFn = vi.fn().mockResolvedValue(built("JOIN_XDR"));
const finalizeFn = vi.fn().mockResolvedValue(built("FINALIZE_XDR"));
const cancelFn = vi.fn().mockResolvedValue(built("CANCEL_XDR"));
const ClientCtor = vi.fn().mockImplementation(function () {
  return { join_tournament: joinFn, finalize_results: finalizeFn, cancel_tournament: cancelFn };
});

vi.mock("@/contract-client", () => ({ Client: ClientCtor }));
vi.mock("./client", () => ({
  networkPassphrase: () => "Test SDF Network ; September 2015",
  networkName: () => "testnet",
}));
vi.mock("@/lib/env", () => ({
  env: { SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org" },
}));

const G = Keypair.random().publicKey();
const G2 = Keypair.random().publicKey();
const G3 = Keypair.random().publicKey();
const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";

beforeEach(() => {
  joinFn.mockClear();
  finalizeFn.mockClear();
  cancelFn.mockClear();
  ClientCtor.mockClear();
});

describe("buildJoinTx", () => {
  it("instantiates Client with contract+source and returns simulated XDR", async () => {
    const { buildJoinTx } = await import("./builders");
    const res = await buildJoinTx({ contractId: C, playerAddress: G });
    expect(res).toEqual({ xdr: "JOIN_XDR", network: "testnet" });
    expect(ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: C, publicKey: G }),
    );
    expect(joinFn).toHaveBeenCalledWith({ player: G });
  });
  it("rejects an invalid contract id", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: G, playerAddress: G })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
  it("rejects an invalid player address", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: C, playerAddress: "x" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("buildFinalizeTx", () => {
  it("passes referee as source and three winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    const res = await buildFinalizeTx({
      contractId: C, refereeAddress: G, first: G, second: G2, third: G3,
    });
    expect(res.xdr).toBe("FINALIZE_XDR");
    expect(finalizeFn).toHaveBeenCalledWith({ first: G, second: G2, third: G3 });
  });
  it("rejects non-distinct winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    await expect(
      buildFinalizeTx({ contractId: C, refereeAddress: G, first: G2, second: G2, third: G3 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("buildCancelTx", () => {
  it("passes organizer as source", async () => {
    const { buildCancelTx } = await import("./builders");
    const res = await buildCancelTx({ contractId: C, organizerAddress: G });
    expect(res.xdr).toBe("CANCEL_XDR");
    expect(ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ publicKey: G }));
  });
});
