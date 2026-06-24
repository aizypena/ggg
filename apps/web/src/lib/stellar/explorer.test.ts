import { describe, it, expect, vi } from "vitest";

const setNetwork = (n: "testnet" | "public") =>
  vi.doMock("@/lib/env", () => ({ env: { STELLAR_NETWORK: n } }));

describe("explorer urls", () => {
  it("builds testnet tx + contract urls", async () => {
    vi.resetModules();
    setNetwork("testnet");
    const { explorerTxUrl, explorerContractUrl } = await import("./explorer");
    expect(explorerTxUrl("ABC123")).toBe("https://stellar.expert/explorer/testnet/tx/ABC123");
    expect(explorerContractUrl("CCONTRACT")).toBe(
      "https://stellar.expert/explorer/testnet/contract/CCONTRACT",
    );
  });
  it("builds public urls", async () => {
    vi.resetModules();
    setNetwork("public");
    const { explorerTxUrl } = await import("./explorer");
    expect(explorerTxUrl("DEF456")).toBe("https://stellar.expert/explorer/public/tx/DEF456");
  });
});
