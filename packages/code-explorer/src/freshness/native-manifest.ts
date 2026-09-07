import type { ReconcileResult } from "./types.js";
import type { NativeManifestOptions } from "./native-manifest-options.js";
import { stableBatch } from "./native-manifest-hashing.js";
import { walkSupportedFiles } from "./native-manifest-files.js";

export type { NativeManifestOptions } from "./native-manifest-options.js";

async function buildManifest(
  options: NativeManifestOptions,
  files: readonly string[],
): Promise<ReconcileResult> {
  const manifest = new Map<string, string>();
  for (let offset = 0; offset < files.length; offset += 64) {
    const cause = mergeStableBatch(
      manifest,
      await stableBatch(options, files.slice(offset, offset + 64)),
    );
    if (cause) return { cause };
  }
  return { manifest };
}

function mergeStableBatch(
  manifest: Map<string, string>,
  stable: readonly (readonly [
    string,
    string | "incomplete_write" | "scan_limit",
  ])[],
): "incomplete_write" | "scan_limit" | undefined {
  for (const [file, hash] of stable) {
    if (hash === "incomplete_write" || hash === "scan_limit") return hash;
    manifest.set(file, hash);
  }
  return undefined;
}

function failureCause(error: unknown): "scan_limit" | "freshness_unavailable" {
  if (error instanceof Error && error.message === "scan_limit")
    return "scan_limit";
  return "freshness_unavailable";
}

export async function reconcileNativeManifest(
  options: NativeManifestOptions,
): Promise<ReconcileResult> {
  const now = options.now ?? Date.now;
  const started = now();
  try {
    const files = await walkSupportedFiles(
      options.root,
      options.supported,
      started,
      now,
    );
    return buildManifest(options, files);
  } catch (error) {
    return { cause: failureCause(error) };
  }
}
