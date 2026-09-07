import chokidar from "chokidar";
import type { FreshnessOptions } from "./freshness-options.js";
import type { FreshnessRuntime } from "./freshness-runtime.js";
import type { Manifest } from "./manifest.js";
import type { WorkspaceWatcher } from "./workspace-watcher.js";

export const coalesceMilliseconds = 100;
export const chokidarWatchOptions = {
  atomic: 100,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  alwaysStat: true,
  followSymlinks: false,
  ignorePermissionErrors: false,
} as const;

function sameManifest(left: Manifest, right: Manifest): boolean {
  return (
    left.size === right.size &&
    [...left].every(([path, hash]) => right.get(path) === hash)
  );
}

export function canPublishGeneration(
  ...args: [
    currentGeneration: number,
    analyzedGeneration: number,
    captured: Manifest,
    prepublication: Manifest,
  ]
): boolean {
  const [currentGeneration, analyzedGeneration, captured, prepublication] =
    args;
  return (
    analyzedGeneration > currentGeneration &&
    sameManifest(captured, prepublication)
  );
}

function createChokidarWatcher(paths: readonly string[]): WorkspaceWatcher {
  return chokidar.watch(
    [...paths],
    chokidarWatchOptions,
  ) as unknown as WorkspaceWatcher;
}

export function createWatcher(
  options: FreshnessOptions,
  schedule: () => void,
): WorkspaceWatcher | undefined {
  try {
    return attachWatcher(createWatcherFor(options), schedule);
  } catch {
    return undefined;
  }
}

function createWatcherFor(options: FreshnessOptions): WorkspaceWatcher {
  return options.createWatcher
    ? options.createWatcher()
    : createChokidarWatcher(options.watch_paths ?? []);
}

function attachWatcher(
  watcher: WorkspaceWatcher,
  schedule: () => void,
): WorkspaceWatcher {
  watcher.on("all", schedule);
  watcher.on("error", schedule);
  return watcher;
}

function clearTimer(options: FreshnessOptions, timer: unknown): void {
  const clear = options.clearTimeout ?? globalThis.clearTimeout;
  clear(timer as ReturnType<typeof setTimeout>);
}

export function clearTimers(
  options: FreshnessOptions,
  runtime: FreshnessRuntime,
): void {
  for (const timer of [
    runtime.coalesceTimer,
    runtime.pollTimer,
    runtime.manifestTimer,
  ]) {
    if (timer !== undefined) clearTimer(options, timer);
  }
}
