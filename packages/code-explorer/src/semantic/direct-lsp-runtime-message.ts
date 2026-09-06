import type { LspProcess } from "./direct-lsp-process.js";
import { isRpcMessage } from "./direct-lsp-protocol.js";
import { handleServerRequest } from "./direct-lsp-runtime-message-handlers.js";
import { handleNotification } from "./direct-lsp-runtime-notifications.js";
import { protocolFailure } from "./direct-lsp-runtime-protocol-failure.js";
import { handleResponse } from "./direct-lsp-runtime-response.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current } from "./direct-lsp-runtime-state.js";

export function handleMessage(input: {
  state: DirectLspRuntimeState;
  message: unknown;
  expectedEpoch: number;
  onRestart?: (process: LspProcess) => Promise<void>;
}): void {
  const { state, message, expectedEpoch } = input;
  if (!messageActive(state, expectedEpoch)) return;
  if (!isRpcMessage(message)) return protocolFailure(input);
  if (isServerRequest(message)) return handleServerRequest(input, message);
  if (isNotification(message)) return handleNotification(input, message);
  handleResponse(input, message);
}

function messageActive(state: DirectLspRuntimeState, epoch: number): boolean {
  return (
    current(state, epoch) &&
    !state.stopped &&
    state.state !== "failed" &&
    state.state !== "unavailable"
  );
}

function isServerRequest(message: Record<string, unknown>): boolean {
  return (
    "id" in message && "method" in message && typeof message.method === "string"
  );
}

function isNotification(message: Record<string, unknown>): boolean {
  return "method" in message && typeof message.method === "string";
}
