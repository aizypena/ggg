import { rpc, TransactionBuilder, type Transaction, Address } from "@stellar/stellar-sdk";
import { getRpc, networkPassphrase } from "./client";
import { signedXdr as signedXdrSchema } from "./validation";
import { StellarError } from "./errors";

export async function simulateAndAssemble(tx: Transaction): Promise<Transaction> {
  const server = getRpc();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new StellarError("SIMULATION_FAILED", sim.error);
  }
  return rpc.assembleTransaction(tx, sim as never).build();
}

export interface SubmitResult {
  hash: string;
  contractId?: string;
  status: "SUCCESS" | "FAILED";
}

export async function submitSignedXdr(
  signedXdrStr: string,
  intent: "deploy" | "initialize" | "join" | "finalize" | "cancel",
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<SubmitResult> {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  const server = getRpc();
  const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new StellarError("SUBMIT_FAILED", `Submit rejected (${intent})`);
  }
  const hash = sent.hash;

  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 1000;
  for (let i = 0; i < attempts; i++) {
    const got = await server.getTransaction(hash);
    if (got.status === "SUCCESS") {
      const contractId = extractContractId(intent, got);
      return contractId ? { hash, status: "SUCCESS", contractId } : { hash, status: "SUCCESS" };
    }
    if (got.status === "FAILED") return { hash, status: "FAILED" };
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new StellarError("TX_TIMEOUT", `Timed out polling ${hash}`);
}

function extractContractId(
  intent: "deploy" | "initialize" | "join" | "finalize" | "cancel",
  got: { returnValue?: unknown },
): string | undefined {
  if (intent !== "deploy" || !got.returnValue) return undefined;
  try {
    // deploy returns the new contract Address scVal; decode to a C-address string.
    // Address.fromScVal(...).toString() yields the C... id; guarded so polling never throws.
    return Address.fromScVal(got.returnValue as never).toString();
  } catch {
    return undefined;
  }
}
