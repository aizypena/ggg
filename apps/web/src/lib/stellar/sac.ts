import { Asset } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";
import { StellarError } from "./errors";

// Circle USDC issuers per network (public values).
const USDC_ISSUER: Record<"testnet" | "public", string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  public: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export function resolveSacAddress(asset: "XLM" | "USDC"): string {
  if (asset === "XLM") {
    if (!env.NATIVE_SAC_ADDRESS) {
      throw new StellarError("UNKNOWN_ASSET", "NATIVE_SAC_ADDRESS not configured");
    }
    return env.NATIVE_SAC_ADDRESS;
  }
  if (asset === "USDC") {
    const issuer = USDC_ISSUER[env.STELLAR_NETWORK];
    if (!issuer) {
      throw new StellarError(
        "UNKNOWN_ASSET",
        `USDC issuer not configured for ${env.STELLAR_NETWORK}`,
      );
    }
    return new Asset("USDC", issuer).contractId(env.NETWORK_PASSPHRASE);
  }
  throw new StellarError("UNKNOWN_ASSET", `Unsupported asset: ${String(asset)}`);
}
