import { DirectLspError } from "./direct-lsp-error.js";
import type { LspProcess } from "./direct-lsp-process.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";

export function fail(input: {
  state: DirectLspRuntimeState;
  code: DirectLspError["code"];
  restart: boolean;
  expectedEpoch?: number;
  onRestart?: (process: LspProcess) => Promise<void>;
}): void {
  const expectedEpoch = input.expectedEpoch ?? input.state.epoch;
  if (!canFail(input.state, expectedEpoch)) return;
  input.state.setState("failed");
  input.state.rejectInflight(input.code);
  input.state.killProcess();
  if (input.restart) recordRestart(input.state, input.onRestart);
}

export function failWithRestart(input: {
  state: DirectLspRuntimeState;
  expectedEpoch: number;
  onRestart?: (process: LspProcess) => Promise<void>;
  code?: DirectLspError["code"];
}): void {
  fail({
    state: input.state,
    code: input.code ?? "backend_crashed",
    restart: true,
    expectedEpoch: input.expectedEpoch,
    onRestart: input.onRestart,
  });
}

function canFail(state: DirectLspRuntimeState, expectedEpoch: number): boolean {
  if (!state.current(expectedEpoch)) return false;
  return state.state !== "failed" && state.state !== "unavailable";
}

function recordRestart(
  state: DirectLspRuntimeState,
  onRestart: ((process: LspProcess) => Promise<void>) | undefined,
): void {
  const delay = state.recordCrash();
  if (delay === undefined) return;
  state.scheduleRestart(() => {
    const replacement = state.options.restart?.();
    if (replacement && onRestart)
      void onRestart(replacement).catch(() => undefined);
  }, delay);
}
