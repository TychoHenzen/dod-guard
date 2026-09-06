import type { DirectLspOptions } from "./direct-lsp-options.js";
import { createDirectLspRuntime } from "./direct-lsp-runtime.js";

export type { ProtectedDocumentContent } from
  "../project-root/protected-document-content.js";
export { DirectLspError } from "./direct-lsp-error.js";
export type { DirectLspOptions } from "./direct-lsp-options.js";
export type { LspProcess } from "./direct-lsp-process.js";
export type { DirectLspScheduler } from "./direct-lsp-scheduler.js";
export type { DirectLspStatus } from "./direct-lsp-status.js";

export function createDirectLspClient(options: DirectLspOptions) {
  return createDirectLspRuntime(options);
}
