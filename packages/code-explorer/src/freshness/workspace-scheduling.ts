import type { FreshnessRuntime } from "./freshness-runtime.js";

export const POLL_INTERVAL_MS = 5_000;

export function schedulePolling(options: {
  runtime: FreshnessRuntime;
  timeout: (callback: () => void, delay: number) => unknown;
  reconcile: () => Promise<void>;
  reschedule: () => void;
}): void {
  const { runtime, timeout, reconcile, reschedule } = options;
  if (
    runtime.closed ||
    runtime.status.mode !== "polling" ||
    runtime.pollTimer !== undefined
  )
    return;
  runtime.pollTimer = timeout(() => {
    runtime.pollTimer = undefined;
    void reconcile().finally(reschedule);
  }, POLL_INTERVAL_MS);
}
