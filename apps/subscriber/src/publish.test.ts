import { describe, it, expect, vi } from "vitest";

const { publish } = vi.hoisted(() => ({ publish: vi.fn(async () => 1) }));
vi.mock("./redis", () => ({ redis: { publish } }));

import { publishChange } from "./publish";

describe("publishChange", () => {
  it("publishes JSON to channel tournament:<id>", async () => {
    await publishChange("t1", { type: "REGISTERED", txHash: "tx1", data: { player: "GA" } });
    expect(publish).toHaveBeenCalledWith(
      "tournament:t1",
      JSON.stringify({ type: "REGISTERED", txHash: "tx1", data: { player: "GA" } }),
    );
  });
});
