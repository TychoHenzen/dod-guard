import { DirectLspError } from "./direct-lsp-error.js";
import {
  isInitializeResult,
  pythonConfiguration,
} from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { fail } from "./direct-lsp-runtime-failure.js";
import { sendRequest } from "./direct-lsp-runtime-request.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current, send } from "./direct-lsp-runtime-state.js";

export async function initializeRuntime(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): Promise<void> {
  const result = await sendRequest({
    state: input.state,
    method: "initialize",
    params: initializeParams(input.state),
    timeout: input.state.timeoutMs,
    expectedEpoch: input.expectedEpoch,
    onRestart: input.onRestart,
  });
  if (
    !(current(input.state, input.expectedEpoch) && isInitializeResult(result))
  )
    throw new DirectLspError("backend_failed");
  input.state.serverCapabilities = result.capabilities;
  checkAfterInitialize(input.state);
  send(
    input.state,
    { jsonrpc: "2.0", method: "initialized", params: {} },
    input.expectedEpoch,
  );
  sendPythonConfiguration(input.state, input.expectedEpoch);
  input.state.state = "ready";
}

function initializeParams(
  state: DirectLspRuntimeState,
): Record<string, unknown> {
  return {
    processId: null,
    rootUri: state.options.root_uri,
    capabilities: state.capabilities,
    initializationOptions: state.initializationOptions,
  };
}

function checkAfterInitialize(state: DirectLspRuntimeState): void {
  const confirmation = state.options.afterInitialize?.();
  if (confirmation?.status !== "unavailable") return;
  state.state = "unavailable";
  state.process?.kill();
  throw new Error(confirmation.code);
}

function sendPythonConfiguration(
  state: DirectLspRuntimeState,
  expectedEpoch: number,
): void {
  if (state.options.language !== "python") return;
  send(
    state,
    {
      jsonrpc: "2.0",
      method: "workspace/didChangeConfiguration",
      params: pythonConfigurationSettings(),
    },
    expectedEpoch,
  );
}

function pythonConfigurationSettings(): Record<string, unknown> {
  return {
    settings: { python: pythonSettings() },
  };
}

function pythonSettings(): Record<string, unknown> {
  return {
    analysis: {
      diagnosticMode: "workspace",
      indexing: true,
      useLibraryCodeForTypes: false,
    },
  };
}
