export type AdminReadErrorCode = "NOT_AVAILABLE" | "READ_UNAVAILABLE";

export class AdminReadError extends Error {
  constructor(readonly code: AdminReadErrorCode) {
    super(code);
    this.name = "AdminReadError";
  }
}
