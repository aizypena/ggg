import { describe, it, expect, vi, beforeEach } from "vitest";

// Real valid Stellar Ed25519 public keys for test fixtures.
const REF = "GALAZ6WGHBL2G6QD6F34ZUUTJRMS3ADPN27DYU5STDD2HXVWLVHYWZDF"; // referee
const A = "GBFJJ5H5KSXN6HVAOQOEKP7KMGFFTRTVM5XBHAZWUCTEXFFOBLXOJ2LJ"; // winner 1st
const B = "GAHJQYXJHY6BG5WAOZM5GLCISC34S7TVU57LLCUOSJWI64C7WYQWVKVF"; // winner 2nd
const C = "GB2PIYWX7Q2OON5RASBNPGU7P7NWE6QD7ZCR6SXRJ4SFCLR5DI54NOFU"; // winner 3rd
const X = "GD2ONDUNWRNUG73YQXYTAE5AVHO3DSQQVJVXONAWTR5BV3BFPGURNWIE"; // non-participant

vi.mock("@/lib/stellar", async (orig) => ({
  ...(await orig<typeof import("@/lib/stellar")>()),
  buildFinalizeTx: vi.fn(async () => ({ xdr: "FIN_XDR", network: "testnet" })),
  StellarError: class StellarError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "StellarError";
      this.code = code;
    }
  },
}));

vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {
    constructor() {
      super("Cross-origin request rejected");
      this.name = "CsrfError";
    }
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
}));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", STELLAR_NETWORK: "testnet" },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => ({
        id: "t_1",
        status: "ACTIVE",
        contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
        refereeAddr: REF,
        participants: [{ playerAddr: A }, { playerAddr: B }, { playerAddr: C }],
      })),
    },
  },
}));

import { POST } from "./route";
import { prisma } from "@/lib/db";
import { buildFinalizeTx } from "@/lib/stellar";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";

const ctx = { params: Promise.resolve({ id: "t_1" }) };

const findUniqueMock = prisma.tournament.findUnique as ReturnType<typeof vi.fn>;
const buildFinalizeTxMock = buildFinalizeTx as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;

function makeReq(
  body: unknown,
  wallet: string = REF,
  origin = "http://localhost:3000",
): Parameters<typeof POST>[0] {
  return new Request("http://localhost:3000/api/tournaments/t_1/finalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-wallet-address": wallet,
    },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/tournaments/[id]/finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      status: "ACTIVE",
      contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
      refereeAddr: REF,
      participants: [{ playerAddr: A }, { playerAddr: B }, { playerAddr: C }],
    });
    buildFinalizeTxMock.mockResolvedValue({ xdr: "FIN_XDR", network: "testnet" });
    assertSameOriginMock.mockImplementation(() => undefined);
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
  });

  it("returns unsigned XDR for the referee with registered, distinct winners", async () => {
    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("FIN_XDR");
    expect(json.data.network).toBe("testnet");
    expect(buildFinalizeTxMock).toHaveBeenCalledWith({
      contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
      refereeAddress: REF,
      first: A,
      second: B,
      third: C,
    });
  });

  it("returns 403 for a non-referee wallet", async () => {
    const res = await POST(makeReq({ first: A, second: B, third: C }, X), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 422 when a winner is not a registered participant", async () => {
    const res = await POST(makeReq({ first: A, second: B, third: X }), ctx);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("UNREGISTERED_WINNER");
  });

  it("returns 400 for non-distinct winners (schema refine)", async () => {
    const res = await POST(makeReq({ first: A, second: A, third: B }), ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
    expect(json.error.message).toMatch(/distinct/i);
  });

  it("returns 404 when tournament does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when tournament is not ACTIVE", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      status: "DRAFT",
      contractId: null,
      refereeAddr: REF,
      participants: [],
    });

    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when tournament is ACTIVE but not yet deployed (contractId null)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      status: "ACTIVE",
      contractId: null,
      refereeAddr: REF,
      participants: [{ playerAddr: A }, { playerAddr: B }, { playerAddr: C }],
    });

    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 422 when buildFinalizeTx throws a StellarError", async () => {
    const { StellarError: SE } = await import("@/lib/stellar");
    buildFinalizeTxMock.mockRejectedValueOnce(new SE("INVALID_INPUT", "Winners must be distinct"));

    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
    expect(json.error.message).toContain("Winners must be distinct");
  });

  it("returns 403 when CSRF check fails", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new CsrfError();
    });

    const res = await POST(makeReq({ first: A, second: B, third: C }, REF, "http://evil.com"), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, remaining: 0 });

    const res = await POST(makeReq({ first: A, second: B, third: C }), ctx);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("returns 400 when x-wallet-address header is missing or invalid", async () => {
    const req = new Request("http://localhost:3000/api/tournaments/t_1/finalize", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ first: A, second: B, third: C }),
    }) as Parameters<typeof POST>[0];

    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/tournaments/t_1/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-wallet-address": REF,
      },
      body: "not-json",
    }) as Parameters<typeof POST>[0];

    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when required winner fields are missing", async () => {
    const res = await POST(makeReq({ first: A, second: B }), ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });
});
