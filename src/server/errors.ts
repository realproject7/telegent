import type { ProtocolError } from "../protocol/index.js";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code: string, message: string): ProtocolError {
  return { ok: false, error: code, message };
}
