/** Error codes shared with the API (spec §36). Fail loudly: never default silently. */
export const ErrorCode = {
  DATA_LAG: "DATA_LAG",
  RPC_LIMIT: "RPC_LIMIT",
  OPENSEA_DOWN: "OPENSEA_DOWN",
  SALE_UNCLASSIFIED: "SALE_UNCLASSIFIED",
  PRICE_BUNDLE: "PRICE_BUNDLE",
  SEED_COMMIT_FAIL: "SEED_COMMIT_FAIL",
  ROOT_POST_FAIL: "ROOT_POST_FAIL",
  LASTPRINT_PENDING: "LASTPRINT_PENDING",
  PUSH_DENIED: "PUSH_DENIED",
  STORAGE_BLOCKED: "STORAGE_BLOCKED",
  CLAIM_RATE: "CLAIM_RATE",
  OPTOUT_APPLIED: "OPTOUT_APPLIED",
  INVALID_INPUT: "INVALID_INPUT",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class LastPrintError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly detail?: unknown) {
    super(`${code}: ${message}`);
    this.name = "LastPrintError";
  }
}

export function invariant(cond: unknown, message: string, detail?: unknown): asserts cond {
  if (!cond) throw new LastPrintError(ErrorCode.INVALID_INPUT, message, detail);
}
