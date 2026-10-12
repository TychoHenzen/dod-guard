import type { FreshnessCause } from "./freshness-cause.js";
import type { FreshnessOptions } from "./freshness-options.js";
import { FreshnessRuntime } from "./freshness-runtime.js";
import type { FreshnessStatus } from "./freshness-status.js";
import type { Manifest } from "./manifest.js";
import type { ReconcileResult } from "./reconcile-result.js";
import {
  clearTimers,
  coalesceMilliseconds,
  createWatcher,
} from "./workspace-freshness-support.js";
import { reconcileWorkspace } from "./workspace-reconciliation.js";
import { schedulePolling } from "./workspace-scheduling.js";

export type { FreshnessCause } from "./freshness-cause.js";
export type { FreshnessOptions } from "./freshness-options.js";
export type { FreshnessStatus } from "./freshness-status.js";
export { isIgnoredWorkspacePath } from "./ignored-paths.js";
export type { Manifest } from "./manifest.js";
export type { ReconcileResult } from "./reconcile-result.js";
export {
  canPublishGeneration,
  chokidarOptionsFor,
  chokidarWatchOptions,
} from "./workspace-freshness-support.js";
export type { WorkspaceWatcher } from "./workspace-watcher.js";

/** Reconciles final manifests so watcher order never becomes project state. */
export class WorkspaceFreshness {
  #runtime = new FreshnessRuntime();

  constructor(private readonly options: FreshnessOptions) {}

  status(): FreshnessStatus {
    return { ...this.#runtime.status };
  }

  failRefresh(): void {
    this.#runtime.failRefresh();
  }

  reserveRefresh(): FreshnessStatus {
    this.#runtime.reserveRefresh();
    return this.status();
  }

  async start(): Promise<void> {
    const watcher = createWatcher(this.options, () => this.schedule());
    if (watcher) this.#runtime.watcher = watcher;
    else {
      this.#runtime.status = { ...this.#runtime.status, mode: "polling" };
      this.#schedulePolling();
    }
    await this.reconcile();
  }

  schedule(): void {
    if (this.#runtime.coalesceTimer !== undefined) return;
    this.#runtime.coalesceTimer = this.timeout(() => {
      this.#runtime.coalesceTimer = undefined;
      void this.reconcile();
    }, coalesceMilliseconds);
  }

  async reconcile(): Promise<void> {
    if (this.#runtime.running) return this.#runtime.running;
    if (this.#runtime.status.pending_generation === null)
      this.#runtime.reserveGeneration();
    const run = reconcileWorkspace(this.options, this.#runtime)
      .catch(() => this.#runtime.degrade("freshness_unavailable"))
      .finally(() => {
        this.#runtime.running = undefined;
      });
    return (this.#runtime.running = run);
  }

  async close(): Promise<void> {
    this.#runtime.closed = true;
    clearTimers(this.options, this.#runtime);
    await this.#runtime.watcher?.close();
  }

  #schedulePolling(): void {
    schedulePolling({
      runtime: this.#runtime,
      timeout: (callback, delay) => this.timeout(callback, delay),
      reconcile: () => this.reconcile(),
      reschedule: () => this.#schedulePolling(),
    });
  }

  private timeout(callback: () => void, delay: number): unknown {
    return (this.options.setTimeout ?? globalThis.setTimeout)(callback, delay);
  }
}
