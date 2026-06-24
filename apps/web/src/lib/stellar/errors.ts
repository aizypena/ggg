export type StellarErrorCode =
  | "INVALID_INPUT"
  | "SIMULATION_FAILED"
  | "SUBMIT_FAILED"
  | "TX_TIMEOUT"
  | "TX_FAILED"
  | "NETWORK_MISMATCH"
  | "UNKNOWN_ASSET";

export class StellarError extends Error {
  readonly code: StellarErrorCode;
  constructor(code: StellarErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StellarError";
    this.code = code;
  }
}
