import { describe, it, expect } from "vitest";
import { StellarError } from "./errors";
import {
  stellarPublicKey,
  stellarContractId,
  i128Amount,
  signedXdr,
  distributionBps,
} from "./validation";

const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"; // valid Testnet G-address
const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5"; // valid contract C-address

describe("StellarError", () => {
  it("carries a code and message", () => {
    const e = new StellarError("INVALID_INPUT", "bad address");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("INVALID_INPUT");
    expect(e.message).toBe("bad address");
    expect(e.name).toBe("StellarError");
  });
});

describe("validators", () => {
  it("accepts a valid G address and rejects others", () => {
    expect(stellarPublicKey.parse(G)).toBe(G);
    expect(stellarPublicKey.safeParse(C).success).toBe(false);
    expect(stellarPublicKey.safeParse("nope").success).toBe(false);
    expect(stellarPublicKey.safeParse("").success).toBe(false);
  });
  it("accepts a valid C address and rejects G", () => {
    expect(stellarContractId.parse(C)).toBe(C);
    expect(stellarContractId.safeParse(G).success).toBe(false);
  });
  it("accepts positive bigint and rejects zero/negative/non-bigint", () => {
    expect(i128Amount.parse(100n)).toBe(100n);
    expect(i128Amount.safeParse(0n).success).toBe(false);
    expect(i128Amount.safeParse(-5n).success).toBe(false);
    expect(i128Amount.safeParse(100).success).toBe(false);
    expect(i128Amount.safeParse(1n << 127n).success).toBe(false);
  });
  it("validates distribution bps triples summing to 10000", () => {
    expect(distributionBps.parse([6000, 3000, 1000])).toEqual([6000, 3000, 1000]);
    expect(distributionBps.safeParse([6000, 3000, 999]).success).toBe(false);
    expect(distributionBps.safeParse([5000, 5000]).success).toBe(false);
    expect(distributionBps.safeParse([6000, 3000, 1000.5]).success).toBe(false);
  });
  it("accepts a base64-looking XDR string and rejects empties", () => {
    expect(signedXdr.parse("AAAAAgAAAAA=")).toBe("AAAAAgAAAAA=");
    expect(signedXdr.safeParse("").success).toBe(false);
    expect(signedXdr.safeParse("!!!not base64!!!").success).toBe(false);
  });
});
