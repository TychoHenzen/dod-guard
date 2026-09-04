import chokidar from "chokidar";
import { type NativeManifestOptions, reconcileNativeManifest } from "./native-manifest.js";

export type FreshnessCause = "freshness_unavailable" | "incomplete_write" | "scan_limit" | "workspace_churn";
export type FreshnessState = "initializing" | "ready" | "refreshing" | "degraded" | "refresh_failed";
export type FreshnessStatus = {
  current_generation: number;
  pending_generation: number | null;
  state: FreshnessState;
  mode: "watching" | "polling";
  degraded_cause?: FreshnessCause;
};

export type Manifest = ReadonlyMap<string, string>;
export type ReconcileResult = { manifest: Manifest } | { cause: FreshnessCause };
export type WorkspaceWatcher = {
  on(event: "all" | "error", listener: (...args: unknown[]) => void): WorkspaceWatcher;
  close(): Promise<void>;
};
export type FreshnessOptions = {
  reconcile: () => Promise<ReconcileResult>;
  /** Builds derived data for one immutable manifest before it can become current. */
  analyze?: (generation: number, manifest: Manifest) => Promise<void>;
  /** Re-reads the final manifest after analysis. Native callers must provide this. */
  verify?: () => Promise<ReconcileResult>;
  createWatcher?: () => WorkspaceWatcher;
  watch_paths?: readonly string[];
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
};

const coalesceMilliseconds = 100;

export function canPublishGeneration(
  currentGeneration: number,
  analyzedGeneration: number,
  captured: Manifest,
  prepublication: Manifest,
): boolean {
  return analyzedGeneration > currentGeneration && sameManifest(captured, prepublication);
}
export const chokidarWatchOptions = {
  atomic: 100,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  alwaysStat: true,
  followSymlinks: false,
  ignorePermissionErrors: false,
} as const;

/** Reconciles final manifests, so watcher event order never becomes project state. */
export class WorkspaceFreshness {
  #status: FreshnessStatus = {
    current_generation: 0,
    pending_generation: null,
    state: "initializing",
    mode: "watching",
  };
  #manifest: Manifest = new Map();
  #watcher: WorkspaceWatcher | undefined;
  #activeSessions = 0;
  #coalesceTimer: unknown;
  #pollTimer: unknown;
  #manifestTimer: unknown;
  #running: Promise<void> | undefined;
  #nextGeneration = 1;
  #forceRefresh = false;

  constructor(private readonly options: FreshnessOptions) {}

  status(): FreshnessStatus {
    return { ...this.#status };
  }

  /** Keeps the last complete generation readable when an explicit refresh cannot finish. */
  failRefresh(): void {
    this.#forceRefresh = false;
    this.#status = {
      current_generation: this.#status.current_generation,
      pending_generation: null,
      state: "refresh_failed",
      mode: this.#status.mode,
    };
  }

  /** Reserves an explicit-refresh generation before backend and derived-data work begins. */
  reserveRefresh(): FreshnessStatus {
    if (this.#status.pending_generation === null) this.#reserveGeneration();
    this.#forceRefresh = true;
    return this.status();
  }

  async start(activeSessions = 0): Promise<void> {
    this.#activeSessions = activeSessions;
    try {
      this.#watcher = (this.options.createWatcher ?? (() => createChokidarWatcher(this.options.watch_paths ?? [])))();
      this.#watcher.on("all", () => this.schedule());
      this.#watcher.on("error", () => this.schedule());
    } catch {
      this.#status = { ...this.#status, mode: "polling" };
      this.#schedulePolling();
    }
    this.#scheduleManifestCheck();
    await this.reconcile();
  }

  setActiveSessions(count: number): void {
    this.#activeSessions = count;
    this.#schedulePolling();
    this.#scheduleManifestCheck();
  }

  schedule(): void {
    if (this.#coalesceTimer !== undefined) return;
    this.#coalesceTimer = this.timeout(() => {
      this.#coalesceTimer = undefined;
      void this.reconcile();
    }, coalesceMilliseconds);
  }

  async reconcile(): Promise<void> {
    if (this.#running) return this.#running;
    if (this.#status.pending_generation === null) this.#reserveGeneration();
    const run = this.#reconcile()
      .catch(() => {
        this.#status = {
          current_generation: this.#status.current_generation,
          pending_generation: null,
          state: "degraded",
          mode: this.#status.mode,
          degraded_cause: "freshness_unavailable",
        };
      })
      .finally(() => {
        this.#running = undefined;
      });
    this.#running = run;
    return run;
  }

  async #reconcile(): Promise<void> {
    for (let mismatchCount = 0; mismatchCount < 3; mismatchCount += 1) {
      const captured = await this.options.reconcile();
      if ("cause" in captured) return this.#degrade(captured.cause);
      if (
        !this.#forceRefresh &&
        this.#status.current_generation > 0 &&
        sameManifest(this.#manifest, captured.manifest)
      ) {
        this.#status = {
          current_generation: this.#status.current_generation,
          pending_generation: null,
          state: "ready",
          mode: this.#status.mode,
        };
        this.#forceRefresh = false;
        return;
      }
      const generation = this.#status.pending_generation ?? this.#reserveGeneration();
      await this.options.analyze?.(generation, captured.manifest);
      const published = this.options.verify ? await this.options.verify() : captured;
      if ("cause" in published) return this.#degrade(published.cause);
      if (canPublishGeneration(this.#status.current_generation, generation, captured.manifest, published.manifest)) {
        this.#manifest = new Map(published.manifest);
        this.#status = {
          current_generation: generation,
          pending_generation: null,
          state: "ready",
          mode: this.#status.mode,
        };
        this.#forceRefresh = false;
        return;
      }
      this.#reserveGeneration();
    }
    this.#degrade("workspace_churn");
  }

  #degrade(cause: FreshnessCause): void {
    this.#forceRefresh = false;
    this.#status = {
      current_generation: this.#status.current_generation,
      pending_generation: null,
      state: "degraded",
      mode: this.#status.mode,
      degraded_cause: cause,
    };
  }

  #reserveGeneration(): number {
    const generation = this.#nextGeneration++;
    this.#status = {
      current_generation: this.#status.current_generation,
      pending_generation: generation,
      state: "refreshing",
      mode: this.#status.mode,
    };
    return generation;
  }

  async close(): Promise<void> {
    if (this.#coalesceTimer !== undefined) this.clear(this.#coalesceTimer);
    if (this.#pollTimer !== undefined) this.clear(this.#pollTimer);
    if (this.#manifestTimer !== undefined) this.clear(this.#manifestTimer);
    await this.#watcher?.close();
  }

  #schedulePeriodic(delay: number, assign: (timer: unknown) => void, callback: () => void): void {
    assign(
      this.timeout(() => {
        callback();
      }, delay),
    );
  }

  #schedulePolling(): void {
    if (this.#status.mode !== "polling" || this.#activeSessions === 0 || this.#pollTimer !== undefined) return;
    this.#schedulePeriodic(
      5_000,
      (timer) => {
        this.#pollTimer = timer;
      },
      () => {
        this.#pollTimer = undefined;
        void this.reconcile().finally(() => this.#schedulePolling());
      },
    );
  }

  #scheduleManifestCheck(): void {
    if (this.#activeSessions === 0 || this.#manifestTimer !== undefined) return;
    this.#schedulePeriodic(
      30_000,
      (timer) => {
        this.#manifestTimer = timer;
      },
      () => {
        this.#manifestTimer = undefined;
        void this.reconcile().finally(() => this.#scheduleManifestCheck());
      },
    );
  }

  private timeout(callback: () => void, delay: number): unknown {
    return (this.options.setTimeout ?? globalThis.setTimeout)(callback, delay);
  }

  private clear(timer: unknown): void {
    (this.options.clearTimeout ?? globalThis.clearTimeout)(timer as ReturnType<typeof setTimeout>);
  }
}

function createChokidarWatcher(paths: readonly string[]): WorkspaceWatcher {
  return chokidar.watch([...paths], chokidarWatchOptions) as unknown as WorkspaceWatcher;
}

function sameManifest(left: Manifest, right: Manifest): boolean {
  return left.size === right.size && [...left].every(([path, hash]) => right.get(path) === hash);
}

/** Creates the real filesystem implementation while keeping tests on controllable watcher and clock seams. */
export function createNativeWorkspaceFreshness(options: NativeManifestOptions): WorkspaceFreshness {
  return new WorkspaceFreshness({
    reconcile: () => reconcileNativeManifest(options),
    verify: () => reconcileNativeManifest(options),
    watch_paths: [options.root],
  });
}
