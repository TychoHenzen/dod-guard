import { reconcileNativeManifest } from "./native-manifest.js";
import type { NativeManifestOptions } from "./native-manifest-options.js";
import { WorkspaceFreshness } from "./workspace-freshness.js";

export function createNativeWorkspaceFreshness(
  options: NativeManifestOptions,
): WorkspaceFreshness {
  return new WorkspaceFreshness({
    reconcile: () => reconcileNativeManifest(options),
    verify: () => reconcileNativeManifest(options),
    watch_paths: [options.root],
  });
}
