import {
  type LandmarkDiscovery,
  landmarksNotReady,
} from "../discovery/landmarks.js";
import { createDiscoveryPipeline } from "../discovery/pipeline.js";
import * as generation from "../freshness/project-generation-scheduler.js";
import { WorkspaceFreshness } from "../freshness/workspace-freshness.js";
import { mintOpaqueId } from "../navigation/focus-view.js";
import { BackendRequestLimiter } from "../navigation/resource-limits.js";
import { SessionManager } from "../navigation/session.js";
import { RootAccessGate } from "../semantic/api/public-api.js";
import type { ServerOptions } from "./server-options.js";
import type { ServerRuntime } from "./server-runtime.js";

const { ProjectGenerationScheduler } = generation;

async function reconcileEmptyManifest() {
  return { manifest: new Map<string, string>() };
}

function createFreshness(options: ServerOptions): WorkspaceFreshness {
  return (
    options.freshness ??
    new WorkspaceFreshness({ reconcile: reconcileEmptyManifest })
  );
}

function createGenerationScheduler(
  options: ServerOptions,
  freshness: WorkspaceFreshness,
): generation.ProjectGenerationScheduler {
  return (
    options.generation_scheduler ?? new ProjectGenerationScheduler(freshness)
  );
}

function createRootAccess(options: ServerOptions): RootAccessGate {
  return new RootAccessGate(
    options.projectRoot,
    options.adapters ?? [],
    options.now,
  );
}

function createRuntimeState(options: ServerOptions): ServerRuntime["state"] {
  return {
    refreshGeneration: 0,
    viewHistory: [],
    discovery: options.projectRoot
      ? createDiscoveryPipeline(options.projectRoot)
      : undefined,
    landmarks: options.landmarks ?? landmarksNotReady(),
  };
}

export function createServerRuntime(options: ServerOptions): ServerRuntime {
  const freshness = createFreshness(options);
  return {
    options,
    connectionId: options.connection_id ?? mintOpaqueId(),
    sessions: new SessionManager(),
    backendRequests: new BackendRequestLimiter(options.backend_timeout_ms),
    freshness,
    generationScheduler: createGenerationScheduler(options, freshness),
    rootAccess: createRootAccess(options),
    state: createRuntimeState(options),
  };
}
