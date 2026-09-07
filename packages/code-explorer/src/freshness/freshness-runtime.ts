import type { FreshnessCause } from "./freshness-cause.js";
import type { FreshnessStatus } from "./freshness-status.js";
import type { Manifest } from "./manifest.js";
import type { WorkspaceWatcher } from "./workspace-watcher.js";

export class FreshnessRuntime {
  status: FreshnessStatus = {
    current_generation: 0,
    pending_generation: null,
    state: "initializing",
    mode: "watching",
  };
  manifest: Manifest = new Map();
  watcher: WorkspaceWatcher | undefined;
  activeSessions = 0;
  coalesceTimer: unknown;
  pollTimer: unknown;
  manifestTimer: unknown;
  running: Promise<void> | undefined;
  forceRefresh = false;
  private nextGeneration = 1;

  reserveGeneration(): number {
    const generation = this.nextGeneration++;
    this.status = {
      current_generation: this.status.current_generation,
      pending_generation: generation,
      state: "refreshing",
      mode: this.status.mode,
    };
    return generation;
  }

  failRefresh(): void {
    this.forceRefresh = false;
    this.status = {
      current_generation: this.status.current_generation,
      pending_generation: null,
      state: "refresh_failed",
      mode: this.status.mode,
    };
  }

  reserveRefresh(): void {
    if (this.status.pending_generation === null) this.reserveGeneration();
    this.forceRefresh = true;
  }

  degrade(cause: FreshnessCause): void {
    this.forceRefresh = false;
    this.status = {
      current_generation: this.status.current_generation,
      pending_generation: null,
      state: "degraded",
      mode: this.status.mode,
      degraded_cause: cause,
    };
  }

  ready(generation: number, manifest: Manifest): void {
    this.manifest = new Map(manifest);
    this.status = {
      current_generation: generation,
      pending_generation: null,
      state: "ready",
      mode: this.status.mode,
    };
    this.forceRefresh = false;
  }
}
