import { SHUTDOWN_TIMEOUT_MS } from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { failWithRestart } from "./direct-lsp-runtime-failure.js";
import { sendRequest } from "./direct-lsp-runtime-request.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current, send } from "./direct-lsp-runtime-state.js";

export async function shutdownRuntime(input: {
  state: DirectLspRuntimeState;
  onRestart?: RestartProcess;
}): Promise<void> {
  if (!input.state.process || input.state.state === "unavailable") return;
  const expectedEpoch = input.state.epoch;
  input.state.stopping = true;
  try {
    await sendRequest({
      state: input.state,
      method: "shutdown",
      params: null,
      timeout: SHUTDOWN_TIMEOUT_MS,
      expectedEpoch,
      onRestart: input.onRestart,
    });
  } catch {
    // Process exit remains required after a shutdown response failure.
  }
  if (!current(input.state, expectedEpoch)) return;
  await sendExit({ ...input, expectedEpoch });
}

async function sendExit(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): Promise<void> {
  const exited = new Promise<void>((resolve) => {
    input.state.exitResolver = resolve;
  });
  send(
    input.state,
    { jsonrpc: "2.0", method: "exit", params: {} },
    input.expectedEpoch,
  );
  const timeout = input.state.scheduler.setTimeout(
    () => forceShutdown(input),
    SHUTDOWN_TIMEOUT_MS,
  );
  await exited;
  input.state.scheduler.clearTimeout(timeout);
  input.state.exitResolver = undefined;
}

function forceShutdown(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  if (!input.state.stopped && current(input.state, input.expectedEpoch)) {
    input.state.stopping = false;
    failWithRestart(input);
  }
  input.state.exitResolver?.();
}
