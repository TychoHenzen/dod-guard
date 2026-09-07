import type { FreshnessCause } from "./freshness-cause.js";
import type { FreshnessOptions } from "./freshness-options.js";
import type { FreshnessStatus } from "./freshness-status.js";
import type { Manifest } from "./manifest.js";
import type { ReconcileResult } from "./reconcile-result.js";
import { FreshnessRuntime } from "./freshness-runtime.js";
import { reconcileWorkspace } from "./workspace-reconciliation.js";
import {
  clearTimers,
  coalesceMilliseconds,
  createWatcher,
} from "./workspace-freshness-support.js";
import { scheduleWorkspaceTimers } from "./workspace-scheduling.js";
export type { FreshnessCause } from "./freshness-cause.js";
export type { FreshnessOptions } from "./freshness-options.js";
export type { FreshnessStatus } from "./freshness-status.js";
export type { Manifest } from "./manifest.js";
export type { ReconcileResult } from "./reconcile-result.js";
export type { WorkspaceWatcher } from "./workspace-watcher.js";
export {
  canPublishGeneration,
  chokidarWatchOptions,
} from "./workspace-freshness-support.js";

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

  async start(activeSessions = 0): Promise<void> {
    this.#runtime.activeSessions = activeSessions;
    const watcher = createWatcher(this.options, () => this.schedule());
    if (watcher) this.#runtime.watcher = watcher;
    if (!watcher) {
      this.#runtime.status = { ...this.#runtime.status, mode: "polling" };
      this.#scheduleTimers();
    }
    this.#scheduleTimers();
    await this.reconcile();
  }

  setActiveSessions(count: number): void {
    this.#runtime.activeSessions = count;
    this.#scheduleTimers();
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
    this.#runtime.running = run;
    return run;
  }

  async close(): Promise<void> {
    clearTimers(this.options, this.#runtime);
    await this.#runtime.watcher?.close();
  }

  #scheduleTimers(): void {
    scheduleWorkspaceTimers({
      runtime: this.#runtime,
      timeout: (callback, delay) => this.timeout(callback, delay),
      reconcile: () => this.reconcile(),
      schedule: () => this.#scheduleTimers(),
    });
  }

  private timeout(callback: () => void, delay: number): unknown {
    return (this.options.setTimeout ?? globalThis.setTimeout)(callback, delay);
  }
}
