import { DirectLspError } from "./direct-lsp-error.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { send } from "./direct-lsp-runtime-state.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";
import {
  isProtectedFileUri,
  statusSnapshot,
} from "./direct-lsp-status-snapshot.js";
import type { ProtectedDocumentContent } from "./protected-document-content.js";

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
  if (state.openedDocumentUris.has(uri)) return;
  send(state, {
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
  state.openedDocumentUris.add(uri);
}

function stateError(state: DirectLspRuntimeState): DirectLspError {
  return new DirectLspError(
    state.state === "unavailable" ? "backend_crashed" : "backend_failed",
  );
}

export function refreshRuntime(state: DirectLspRuntimeState): void {
  state.crashTimes = [];
  state.timeoutTimes = [];
  if (state.state === "unavailable") state.state = "initializing";
}

export function statusRuntime(state: DirectLspRuntimeState): DirectLspStatus {
  return statusSnapshot({
    state: state.state,
    events: state.events,
    restartDelays: state.restartDelays,
    serverCapabilities: state.serverCapabilities,
  });
}
