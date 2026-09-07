import type { FreshnessOptions } from "./freshness-options.js";
import type { FreshnessRuntime } from "./freshness-runtime.js";
import type { Manifest } from "./manifest.js";
import { canPublishGeneration } from "./workspace-freshness-support.js";

function sameManifest(left: Manifest, right: Manifest): boolean {
  return (
    left.size === right.size &&
    [...left].every(([path, hash]) => right.get(path) === hash)
  );
}

function canReuseCurrent(
  runtime: FreshnessRuntime,
  captured: Manifest,
): boolean {
  return (
    !runtime.forceRefresh &&
    runtime.status.current_generation > 0 &&
    sameManifest(runtime.manifest, captured)
  );
}

function readyCurrent(runtime: FreshnessRuntime): void {
  runtime.status = {
    current_generation: runtime.status.current_generation,
    pending_generation: null,
    state: "ready",
    mode: runtime.status.mode,
  };
  runtime.forceRefresh = false;
}

async function reconcileAttempt(
  options: FreshnessOptions,
  runtime: FreshnessRuntime,
): Promise<boolean> {
  const captured = await options.reconcile();
  if ("cause" in captured) {
    runtime.degrade(captured.cause);
    return true;
  }
  if (canReuseCurrent(runtime, captured.manifest)) {
    readyCurrent(runtime);
    return true;
  }
  return analyzeAndPublish(options, runtime, captured.manifest);
}

async function analyzeAndPublish(
  options: FreshnessOptions,
  runtime: FreshnessRuntime,
  captured: Manifest,
): Promise<boolean> {
  const generation = generationFor(runtime);
  await options.analyze?.(generation, captured);
  const published = await publishedResult(options, captured);
  if ("cause" in published) {
    runtime.degrade(published.cause);
    return true;
  }
  if (
    canPublishGeneration(
      runtime.status.current_generation,
      generation,
      captured,
      published.manifest,
    )
  ) {
    runtime.ready(generation, published.manifest);
    return true;
  }
  runtime.reserveGeneration();
  return false;
}

function generationFor(runtime: FreshnessRuntime): number {
  if (runtime.status.pending_generation !== null)
    return runtime.status.pending_generation;
  return runtime.reserveGeneration();
}

function publishedResult(options: FreshnessOptions, captured: Manifest) {
  if (options.verify) return options.verify();
  return Promise.resolve({ manifest: captured });
}

export async function reconcileWorkspace(
  options: FreshnessOptions,
  runtime: FreshnessRuntime,
): Promise<void> {
  for (let mismatchCount = 0; mismatchCount < 3; mismatchCount += 1) {
    if (await reconcileAttempt(options, runtime)) return;
  }
  runtime.degrade("workspace_churn");
}
