import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";

export const defaultDirectLspScheduler: DirectLspScheduler = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};
