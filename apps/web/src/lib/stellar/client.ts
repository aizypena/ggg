import { rpc, Horizon } from "@stellar/stellar-sdk";
import { env } from "@/lib/env";

let rpcServer: rpc.Server | undefined;
let horizonServer: Horizon.Server | undefined;

export function getRpc(): rpc.Server {
  if (!rpcServer) rpcServer = new rpc.Server(env.SOROBAN_RPC_URL);
  return rpcServer;
}

export function getHorizon(): Horizon.Server {
  if (!horizonServer) horizonServer = new Horizon.Server(env.HORIZON_URL);
  return horizonServer;
}

export function networkPassphrase(): string {
  return env.NETWORK_PASSPHRASE;
}

export function networkName(): "testnet" | "public" {
  return env.STELLAR_NETWORK;
}
