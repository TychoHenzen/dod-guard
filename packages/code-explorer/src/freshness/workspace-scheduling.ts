import type { FreshnessRuntime } from "./freshness-runtime.js";

function schedulePolling(options: {
  runtime: FreshnessRuntime;
  timeout: (callback: () => void, delay: number) => unknown;
  reconcile: () => Promise<void>;
  schedulePolling: () => void;
}): void {
  const { runtime, timeout, reconcile, schedulePolling } = options;
  if (
    runtime.status.mode !== "polling" ||
    runtime.activeSessions === 0 ||
    runtime.pollTimer !== undefined
  )
    return;
  runtime.pollTimer = timeout(() => {
    runtime.pollTimer = undefined;
    void reconcile().finally(schedulePolling);
  }, 5_000);
}

function scheduleManifestCheck(options: {
  runtime: FreshnessRuntime;
  timeout: (callback: () => void, delay: number) => unknown;
  reconcile: () => Promise<void>;
  scheduleManifestCheck: () => void;
}): void {
  const { runtime, timeout, reconcile, scheduleManifestCheck } = options;
  if (runtime.activeSessions === 0 || runtime.manifestTimer !== undefined)
    return;
  runtime.manifestTimer = timeout(() => {
    runtime.manifestTimer = undefined;
    void reconcile().finally(scheduleManifestCheck);
  }, 30_000);
}

export function scheduleWorkspaceTimers(options: {
  runtime: FreshnessRuntime;
  timeout: (callback: () => void, delay: number) => unknown;
  reconcile: () => Promise<void>;
  schedule: () => void;
}): void {
  schedulePolling({ ...options, schedulePolling: options.schedule });
  scheduleManifestCheck({
    ...options,
    scheduleManifestCheck: options.schedule,
  });
}
