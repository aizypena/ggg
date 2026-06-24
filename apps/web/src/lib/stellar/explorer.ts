import { env } from "@/lib/env";

function base(): string {
  const net = env.STELLAR_NETWORK === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}`;
}

export function explorerTxUrl(hash: string): string {
  return `${base()}/tx/${hash}`;
}

export function explorerContractUrl(contractId: string): string {
  return `${base()}/contract/${contractId}`;
}
