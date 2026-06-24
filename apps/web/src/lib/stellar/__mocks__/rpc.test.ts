import { describe, it, expect } from "vitest";
import { makeFakeRpc, successSim, txStatus } from "./rpc";

describe("fake rpc", () => {
  it("returns the canned simulation and getTransaction", async () => {
    const rpc = makeFakeRpc({
      simulateTransaction: successSim(),
      getTransaction: txStatus("SUCCESS"),
    });
    const sim = await rpc.simulateTransaction({} as never);
    expect("error" in sim).toBe(false);
    const got = await rpc.getTransaction("HASH");
    expect(got.status).toBe("SUCCESS");
  });
});
