import { DirectLspError } from "./direct-lsp-error.js";
import type { LspProcess } from "./direct-lsp-process.js";
import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { fail, failWithRestart } from "./direct-lsp-runtime-failure.js";
import { handleStdout } from "./direct-lsp-runtime-frame.js";
import { initializeRuntime } from "./direct-lsp-runtime-initialize.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current } from "./direct-lsp-runtime-state.js";

export async function startRuntime(input: {
  state: DirectLspRuntimeState;
  process: LspProcess;
  onRestart?: RestartProcess;
}): Promise<void> {
  prepareStart(input.state, input.process);
  const expectedEpoch = input.state.epoch;
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

function prepareStart(state: DirectLspRuntimeState, process: LspProcess): void {
  state.process = process;
  state.epoch += 1;
  state.bytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  state.openedDocumentUris = new Set();
  state.stopping = false;
  state.stopped = false;
  state.state = "initializing";
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
  if (!current(state, expectedEpoch)) return;
  state.stopped = true;
  state.exitResolver?.();
  if (state.bytes.length) {
    fail({
      ...input,
      code: "backend_failed",
      restart: false,
    });
    return;
  }
  if (state.stopping) {
    state.state = "failed";
    return;
  }
  failWithRestart(input);
}
