import { SHUTDOWN_TIMEOUT_MS } from "./direct-lsp-protocol.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { failWithRestart } from "./direct-lsp-runtime-failure.js";
import { sendRequest } from "./direct-lsp-runtime-request.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export async function shutdownRuntime(input: {
  state: DirectLspRuntimeState;
  onRestart?: RestartProcess;
}): Promise<void> {
  input.state.cancelRestarts();
  if (!input.state.process || input.state.stopped) {
    input.state.invalidate();
    return;
  }
  const expectedEpoch = input.state.epoch;
  input.state.setStopping(true);
  if (input.state.state === "ready") {
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
  }
  await finishShutdown({ ...input, expectedEpoch });
}

async function finishShutdown(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): Promise<void> {
  if (!input.state.current(input.expectedEpoch)) {
    input.state.killProcess();
    return;
  }
  if (input.state.state !== "ready") {
    terminateNow(input.state);
    return;
  }
  await sendExit(input);
}

async function sendExit(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): Promise<void> {
  const exited = new Promise<void>((resolve) => {
    input.state.setExitResolver(resolve);
  });
  input.state.send(
    { jsonrpc: "2.0", method: "exit", params: {} },
    input.expectedEpoch,
  );
  const timeout = input.state.scheduler.setTimeout(
    () => forceShutdown(input),
    SHUTDOWN_TIMEOUT_MS,
  );
  await exited;
  input.state.scheduler.clearTimeout(timeout);
  input.state.clearExitResolver();
}

function forceShutdown(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  if (!input.state.stopped && input.state.current(input.expectedEpoch)) {
    input.state.setStopping(false);
    failWithRestart({
      state: input.state,
      expectedEpoch: input.expectedEpoch,
      onRestart: input.onRestart,
    });
  }
  input.state.resolveExit();
}

function terminateNow(state: DirectLspRuntimeState): void {
  state.cancelRestarts();
  state.invalidate();
  state.killProcess();
  state.resolveExit();
}
