import { DirectLspError } from "./direct-lsp-error.js";
import type { LspProcess } from "./direct-lsp-process.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { fail, failWithRestart } from "./direct-lsp-runtime-failure.js";
import { handleStdout } from "./direct-lsp-runtime-frame.js";
import { initializeRuntime } from "./direct-lsp-runtime-initialize.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export async function startRuntime(input: {
  state: DirectLspRuntimeState;
  process: LspProcess;
  onRestart?: RestartProcess;
}): Promise<void> {
  if (input.state.stopping) return;
  const expectedEpoch = input.state.beginStart(input.process);
  attachProcess({ ...input, expectedEpoch });
  try {
    await initializeRuntime({ ...input, expectedEpoch });
  } catch (error) {
    fail({
      state: input.state,
      code: error instanceof DirectLspError ? error.code : "backend_failed",
      restart: true,
      expectedEpoch,
      onRestart: input.onRestart,
    });
    throw error;
  }
}

function attachProcess(input: {
  state: DirectLspRuntimeState;
  process: LspProcess;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  input.process.onStdout((chunk) => handleStdout({ ...input, chunk }));
  input.process.onExit(() => handleExit(input));
  input.process.onError?.(() => failWithRestart(input));
}

function handleExit(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  const { state, expectedEpoch } = input;
  if (!state.current(expectedEpoch)) return;
  state.markStopped();
  state.resolveExit();
  if (state.bytesLength()) {
    fail({
      ...input,
      code: "backend_failed",
      restart: false,
    });
    return;
  }
  if (state.stopping) {
    state.setState("failed");
    return;
  }
  failWithRestart(input);
}
