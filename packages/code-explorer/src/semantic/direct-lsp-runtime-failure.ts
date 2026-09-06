import { DirectLspError } from "./direct-lsp-error.js";
import type { LspProcess } from "./direct-lsp-process.js";
import { RESTART_DELAYS_MS, RESTART_WINDOW_MS } from "./direct-lsp-protocol.js";
import type { DirectLspRuntimeState } from "./direct-lsp-runtime-state.js";
import { current, rejectInflight } from "./direct-lsp-runtime-state.js";

export function fail(input: {
  state: DirectLspRuntimeState;
  code: DirectLspError["code"];
  restart: boolean;
  expectedEpoch?: number;
  onRestart?: (process: LspProcess) => Promise<void>;
}): void {
  const expectedEpoch = input.expectedEpoch ?? input.state.epoch;
  if (!canFail(input.state, expectedEpoch)) return;
  input.state.state = "failed";
  rejectInflight(input.state, input.code);
  input.state.process?.kill();
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
  if (!current(state, expectedEpoch)) return false;
  return state.state !== "failed" && state.state !== "unavailable";
}

function recordRestart(
  state: DirectLspRuntimeState,
  onRestart: ((process: LspProcess) => Promise<void>) | undefined,
): void {
  state.crashTimes = state.crashTimes.filter(
    (time) => time >= state.scheduler.now() - RESTART_WINDOW_MS,
  );
  state.crashTimes.push(state.scheduler.now());
  if (state.crashTimes.length > RESTART_DELAYS_MS.length) {
    state.state = "unavailable";
    return;
  }
  const delay = RESTART_DELAYS_MS[state.crashTimes.length - 1];
  state.restartDelays.push(delay);
  state.scheduler.setTimeout(() => {
    const replacement = state.options.restart?.();
    if (replacement && onRestart)
      void onRestart(replacement).catch(() => undefined);
  }, delay);
}
