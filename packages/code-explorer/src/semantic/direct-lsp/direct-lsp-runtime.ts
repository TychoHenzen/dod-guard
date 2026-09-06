import type { DirectLspOptions } from "./direct-lsp-options.js";
import type { LspProcess } from "./direct-lsp-process.js";
import {
  openProtectedDocument,
  refreshRuntime,
  shutdownRuntime,
  statusRuntime,
} from "./direct-lsp-runtime-operations.js";
import { requestBackend } from "./direct-lsp-runtime-query.js";
import { startRuntime } from "./direct-lsp-runtime-start.js";
import { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import type {
  ProtectedDocumentContent,
} from "../project-root/protected-document-content.js";

export function createDirectLspRuntime(options: DirectLspOptions) {
  const state = new DirectLspRuntimeState(options);
  const start = (process: LspProcess) =>
    startRuntime({ state, process, onRestart: start });
  return {
    start,
    request: (method: string, params: unknown) =>
      requestBackend({
        state,
        method,
        params,
        onRestart: start,
      }),
    openProtectedDocument: (uri: string, content: ProtectedDocumentContent) =>
      openProtectedDocument(state, uri, content),
    shutdown: () => shutdownRuntime({ state, onRestart: start }),
    refresh: () => refreshRuntime(state),
    status: () => statusRuntime(state),
  };
}
