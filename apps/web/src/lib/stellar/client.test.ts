import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  },
}));

const rpcCtor = vi.fn();
const horizonCtor = vi.fn();
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: class {
      constructor(url: string) {
        rpcCtor(url);
      }
    },
  },
  Horizon: {
    Server: class {
      constructor(url: string) {
        horizonCtor(url);
      }
    },
  },
}));

beforeEach(() => {
  rpcCtor.mockClear();
  horizonCtor.mockClear();
});

describe("client factory", () => {
  it("constructs RPC server from env url and memoizes", async () => {
    const { getRpc } = await import("./client");
    const a = getRpc();
    const b = getRpc();
    expect(a).toBe(b);
    expect(rpcCtor).toHaveBeenCalledTimes(1);
    expect(rpcCtor).toHaveBeenCalledWith("https://soroban-testnet.stellar.org");
  });
  it("constructs Horizon server from env url", async () => {
    const { getHorizon } = await import("./client");
    getHorizon();
    expect(horizonCtor).toHaveBeenCalledWith("https://horizon-testnet.stellar.org");
  });
  it("exposes passphrase and network name", async () => {
    const { networkPassphrase, networkName } = await import("./client");
    expect(networkPassphrase()).toBe("Test SDF Network ; September 2015");
    expect(networkName()).toBe("testnet");
  });
});
