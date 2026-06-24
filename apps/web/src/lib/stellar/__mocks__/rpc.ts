import { vi, type Mock } from "vitest";

export interface FakeRpc {
  simulateTransaction: Mock<(s: unknown) => Promise<Record<string, unknown>>>;
  getTransaction: Mock<(hash: string) => Promise<Record<string, unknown>>>;
  sendTransaction: Mock<(tx: unknown) => Promise<Record<string, unknown>>>;
  getLatestLedger: Mock<() => Promise<Record<string, unknown>>>;
  [key: string]: unknown;
}

export function successSim() {
  // shape mirrors rpc.Api.SimulateTransactionSuccessResponse (no `error` key)
  return vi.fn().mockResolvedValue({
    transactionData: { build: () => ({}) },
    minResourceFee: "100",
    result: { retval: {}, auth: [] },
    latestLedger: 1,
  });
}

export function errorSim(message = "sim failed") {
  return vi.fn().mockResolvedValue({ error: message, latestLedger: 1 });
}

export function txStatus(status: "SUCCESS" | "FAILED" | "NOT_FOUND") {
  return vi.fn().mockResolvedValue({
    status,
    txHash: "HASH",
    latestLedger: 2,
    returnValue: {},
  });
}

export function makeFakeRpc(overrides: Record<string, unknown> = {}): FakeRpc {
  return {
    simulateTransaction: successSim(),
    getTransaction: txStatus("SUCCESS"),
    sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1 }),
    ...overrides,
  } as FakeRpc;
}

export function makeFakeHorizon(overrides: Record<string, unknown> = {}) {
  return {
    loadAccount: vi.fn().mockResolvedValue({ accountId: () => "G", sequenceNumber: () => "1" }),
    ...overrides,
  } as never;
}
