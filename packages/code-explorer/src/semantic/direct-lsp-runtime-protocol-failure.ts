import type { RestartProcess } from "./direct-lsp-restart-process.js";
import { fail } from "./direct-lsp-runtime-failure.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export function protocolFailure(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: RestartProcess;
}): void {
  fail({
    state: input.state,
    code: "backend_failed",
    restart: false,
    expectedEpoch: input.expectedEpoch,
    onRestart: input.onRestart,
  });
}
