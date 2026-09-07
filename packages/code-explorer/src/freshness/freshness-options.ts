import type { Manifest } from "./manifest.js";
import type { ReconcileResult } from "./reconcile-result.js";
import type { WorkspaceWatcher } from "./workspace-watcher.js";

export type FreshnessOptions = {
  reconcile: () => Promise<ReconcileResult>;
  analyze?: (generation: number, manifest: Manifest) => Promise<void>;
  verify?: () => Promise<ReconcileResult>;
  createWatcher?: () => WorkspaceWatcher;
  watch_paths?: readonly string[];
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
};
