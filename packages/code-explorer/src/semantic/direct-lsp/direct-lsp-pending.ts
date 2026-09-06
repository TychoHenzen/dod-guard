import type { DirectLspError } from "./direct-lsp-error.js";

export type Pending = {
  resolve(value: unknown): void;
  reject(reason: DirectLspError): void;
  timer: unknown;
};
