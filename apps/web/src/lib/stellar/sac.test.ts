import { describe, it, expect, vi } from "vitest";
import { StellarError } from "./errors";

vi.mock("@/lib/env", () => ({
  env: {
    STELLAR_NETWORK: "testnet",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NATIVE_SAC_ADDRESS: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
}));

describe("resolveSacAddress", () => {
  it("returns the native SAC for XLM from env", async () => {
    const { resolveSacAddress } = await import("./sac");
    expect(resolveSacAddress("XLM")).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
  });
  it("derives a valid C-address SAC for USDC on testnet", async () => {
    const { resolveSacAddress } = await import("./sac");
    const addr = resolveSacAddress("USDC");
    expect(addr).toMatch(/^C[A-Z2-7]{55}$/);
  });
  it("throws UNKNOWN_ASSET for anything else", async () => {
    const { resolveSacAddress } = await import("./sac");
    // @ts-expect-error testing runtime guard
    expect(() => resolveSacAddress("ETH")).toThrow(StellarError);
  });
});
