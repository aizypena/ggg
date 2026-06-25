import { rpc, Horizon, scValToNative, xdr } from "@stellar/stellar-sdk";
import { z } from "zod";
import { env } from "./env";

const eventSchema = z.object({
  type: z.string(),
  ledger: z.number().int(),
  txHash: z.string(),
  topic: z.array(z.string()),
  value: z.string(),
});
const eventsResponseSchema = z.object({
  latestLedger: z.number().int(),
  events: z.array(eventSchema),
});
export type DecodedEvents = z.infer<typeof eventsResponseSchema>;
export type DecodedEvent = z.infer<typeof eventSchema>;

/** Validate a normalised getEvents response (topic/value already base64 XDR). */
export function decodeEventsResponse(raw: unknown): DecodedEvents {
  return eventsResponseSchema.parse(raw);
}

/** Decode a base64 ScVal topic/value into a JS native via the SDK. */
export function decodeScVal(b64: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(b64, "base64"));
}

// Lazy server singletons: constructing these reads `env`, so we defer it until
// first use to keep pure helpers (decodeEventsResponse/decodeScVal) importable
// without a fully-populated environment (e.g. in unit tests).
let rpcServer: rpc.Server | undefined;
function getRpcServer(): rpc.Server {
  rpcServer ??= new rpc.Server(env.SOROBAN_RPC_URL, {
    allowHttp: env.SOROBAN_RPC_URL.startsWith("http://"),
  });
  return rpcServer;
}

let horizonServer: Horizon.Server | undefined;
function getHorizonServer(): Horizon.Server {
  horizonServer ??= new Horizon.Server(env.HORIZON_URL, {
    allowHttp: env.HORIZON_URL.startsWith("http://"),
  });
  return horizonServer;
}

export async function getEvents(contractId: string, startLedger: number): Promise<DecodedEvents> {
  const res = await getRpcServer().getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contractId] }],
  });
  // Normalise SDK ScVal topics/values into base64 XDR strings before Zod
  // validation, so decoding is uniform with the test contract and decodeScVal.
  const normalized = {
    latestLedger: res.latestLedger,
    events: res.events.map((e) => ({
      type: String(e.type),
      ledger: e.ledger,
      txHash: e.txHash,
      topic: e.topic.map((t) => t.toXDR("base64")),
      value: e.value.toXDR("base64"),
    })),
  };
  return decodeEventsResponse(normalized);
}

const paymentSchema = z.object({
  id: z.string(),
  type: z.literal("payment"),
  transaction_hash: z.string(),
  paging_token: z.string(),
  from: z.string(),
  to: z.string(),
  amount: z.string(),
});
export type DecodedPayment = z.infer<typeof paymentSchema>;

export async function getContractPayments(
  contractAddr: string,
  hzCursor: string | null,
): Promise<{ payments: (DecodedPayment & { memo: string | null })[]; nextCursor: string | null }> {
  let builder = getHorizonServer().payments().forAccount(contractAddr).order("asc").limit(50);
  if (hzCursor) builder = builder.cursor(hzCursor);
  const page = await builder.call();
  const out: (DecodedPayment & { memo: string | null })[] = [];
  let nextCursor = hzCursor;
  for (const record of page.records) {
    if (record.type !== "payment") continue;
    const payment = paymentSchema.parse(record);
    const tx = await (
      record as unknown as { transaction: () => Promise<{ memo?: string | null }> }
    ).transaction();
    out.push({ ...payment, memo: tx.memo ?? null });
    nextCursor = payment.paging_token;
  }
  return { payments: out, nextCursor };
}
