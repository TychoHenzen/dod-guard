import type { BrowserServerErrorCode } from "./browser-server-error-code.js";

export class BrowserServerError extends Error {
  constructor(readonly code: BrowserServerErrorCode) {
    super(code);
  }
}
