import { Client } from "@/contract-client";
import { env } from "@/lib/env";
import { networkName, networkPassphrase } from "./client";
import {
  stellarContractId,
  stellarPublicKey,
  i128Amount,
  distributionBps as bpsSchema,
} from "./validation";
import { StellarError } from "./errors";

function parse(
  schema: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
  label: string,
): void {
  if (!schema.safeParse(v).success) throw new StellarError("INVALID_INPUT", `Invalid ${label}`);
}

function clientFor(contractId: string, source: string): InstanceType<typeof Client> {
  return new Client({
    contractId,
    publicKey: source,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  });
}

export async function buildJoinTx(params: {
  contractId: string;
  playerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.playerAddress, "playerAddress");
  const c = clientFor(params.contractId, params.playerAddress);
  const assembled = await c.join_tournament({ player: params.playerAddress });
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildFinalizeTx(params: {
  contractId: string;
  refereeAddress: string;
  first: string;
  second: string;
  third: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  for (const [k, v] of [
    ["first", params.first],
    ["second", params.second],
    ["third", params.third],
  ] as const) {
    parse(stellarPublicKey, v, k);
  }
  const winners = new Set([params.first, params.second, params.third]);
  if (winners.size !== 3) throw new StellarError("INVALID_INPUT", "Winners must be distinct");
  const c = clientFor(params.contractId, params.refereeAddress);
  const assembled = await c.finalize_results({
    first: params.first,
    second: params.second,
    third: params.third,
  });
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildCancelTx(params: {
  contractId: string;
  organizerAddress: string;
}): Promise<{ xdr: string; network: string }> {
  parse(stellarContractId, params.contractId, "contractId");
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  const c = clientFor(params.contractId, params.organizerAddress);
  const assembled = await c.cancel_tournament();
  return { xdr: assembled.toXDR(), network: networkName() };
}

export async function buildDeployInitializeTx(params: {
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
}): Promise<{ xdr: string; network: string }> {
  parse(stellarPublicKey, params.organizerAddress, "organizerAddress");
  parse(stellarPublicKey, params.refereeAddress, "refereeAddress");
  parse(stellarContractId, params.tokenAddr, "tokenAddr");
  parse(i128Amount, params.entryFee, "entryFee");
  parse(bpsSchema, params.distributionBps, "distributionBps");
  if (params.organizerAddress === params.refereeAddress) {
    throw new StellarError("INVALID_INPUT", "organizer must differ from referee");
  }
  if (!env.ESCROW_WASM_HASH) {
    throw new StellarError("INVALID_INPUT", "ESCROW_WASM_HASH not configured");
  }
  // TODO: the generated Phase 1 binding deploys a contract but does not accept
  // init args (the contract exposes `initialize`, not a Soroban constructor).
  // A follow-up should either regenerate bindings with constructor support or
  // build a multi-op transaction (createCustomContract + initialize) manually.
  const assembled = await Client.deploy({
    wasmHash: env.ESCROW_WASM_HASH,
    publicKey: params.organizerAddress,
    networkPassphrase: networkPassphrase(),
    rpcUrl: env.SOROBAN_RPC_URL,
  });
  return { xdr: assembled.toXDR(), network: networkName() };
}
