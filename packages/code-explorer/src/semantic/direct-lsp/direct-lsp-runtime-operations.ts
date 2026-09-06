import type { ProtectedDocumentContent } from "../project-root/protected-document-content.js";
import { DirectLspError } from "./direct-lsp-error.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";
import {
  isProtectedFileUri,
  statusSnapshot,
} from "./direct-lsp-status-snapshot.js";

export { shutdownRuntime } from "./direct-lsp-runtime-shutdown.js";

export function openProtectedDocument(
  state: DirectLspRuntimeState,
  uri: string,
  content: ProtectedDocumentContent,
): void {
  if (state.state !== "ready") throw stateError(state);
  if (
    !isProtectedFileUri(uri, state.options.root_uri) ||
    typeof content.bytes !== "string"
  )
    throw new DirectLspError("backend_write_rejected");
  if (state.hasOpenedDocument(uri)) return;
  state.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: content.language_id,
        version: 0,
        text: content.bytes,
      },
    },
  });
  state.markDocumentOpened(uri);
}

function stateError(state: DirectLspRuntimeState): DirectLspError {
  return new DirectLspError(
    state.state === "unavailable" ? "backend_crashed" : "backend_failed",
  );
}

export function refreshRuntime(state: DirectLspRuntimeState): void {
  state.resetFailureHistory();
}

export function statusRuntime(state: DirectLspRuntimeState): DirectLspStatus {
  return statusSnapshot({
    state: state.state,
    events: state.eventsSnapshot(),
    restartDelays: state.restartDelaysSnapshot(),
    serverCapabilities: state.serverCapabilities,
  });
}
