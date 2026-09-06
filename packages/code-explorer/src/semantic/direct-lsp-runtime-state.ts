import { DirectLspError } from "./direct-lsp-error.js";
import type { DirectLspOptions } from "./direct-lsp-options.js";
import type { Pending } from "./direct-lsp-pending.js";
import type { LspProcess } from "./direct-lsp-process.js";
import {
  boundedTimeout,
  clone,
  deepFreeze,
  encodeMessage,
} from "./direct-lsp-protocol.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";

export type DirectLspRuntimeState = {
  options: DirectLspOptions;
  scheduler: DirectLspScheduler;
  capabilities: Record<string, unknown>;
  initializationOptions: Record<string, unknown>;
  timeoutMs: number;
  process: LspProcess | undefined;
  epoch: number;
  state: DirectLspStatus["state"];
  bytes: Uint8Array;
  stopping: boolean;
  stopped: boolean;
  crashTimes: number[];
  timeoutTimes: number[];
  exitResolver: (() => void) | undefined;
  pending: Map<number, Pending>;
  events: DirectLspStatus["events"][number][];
  restartDelays: number[];
  openedDocumentUris: Set<string>;
  serverCapabilities: Record<string, unknown> | undefined;
  nextId: number;
};

const defaultScheduler: DirectLspScheduler = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createRuntimeState(
  options: DirectLspOptions,
): DirectLspRuntimeState {
  return {
    options,
    scheduler: options.scheduler ?? defaultScheduler,
    capabilities: deepFreeze(clone(options.capabilities)),
    initializationOptions: deepFreeze(
      clone(options.safe_initialization_options),
    ),
    timeoutMs: boundedTimeout(options.request_timeout_ms ?? 10_000),
    process: undefined,
    epoch: 0,
    state: "initializing",
    bytes: new Uint8Array(0) as Uint8Array<ArrayBufferLike>,
    stopping: false,
    stopped: false,
    crashTimes: [],
    timeoutTimes: [],
    exitResolver: undefined,
    pending: new Map(),
    events: [],
    restartDelays: [],
    openedDocumentUris: new Set(),
    serverCapabilities: undefined,
    nextId: 1,
  };
}

export function current(state: DirectLspRuntimeState, epoch: number): boolean {
  return epoch === state.epoch;
}

export function send(
  state: DirectLspRuntimeState,
  message: Record<string, unknown>,
  expectedEpoch = state.epoch,
): void {
  if (state.process && current(state, expectedEpoch))
    state.process.write(encodeMessage(message));
}

export function rejectInflight(
  state: DirectLspRuntimeState,
  code: DirectLspError["code"],
): void {
  for (const entry of state.pending.values()) {
    state.scheduler.clearTimeout(entry.timer);
    entry.reject(new DirectLspError(code));
  }
  state.pending.clear();
}
