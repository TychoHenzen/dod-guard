import { type LandmarkDiscovery, landmarksNotReady } from "../discovery/landmarks.js";
import { createDiscoveryPipeline } from "../discovery/pipeline.js";
import { ProjectGenerationScheduler } from "../freshness/project-generation-scheduler.js";
import { WorkspaceFreshness } from "../freshness/workspace-freshness.js";
import { BackendRequestLimiter } from "../navigation/resource-limits.js";
import { SessionManager } from "../navigation/session.js";
import { mintOpaqueId } from "../navigation/focus-view.js";
import { RootAccessGate } from "../semantic/api/public-api.js";
import type { ServerOptions } from "./server-options.js";
import type { ServerRuntime } from "./server-runtime.js";

export function createServerRuntime(options: ServerOptions): ServerRuntime {
  const freshness = options.freshness ?? new WorkspaceFreshness({ reconcile: async () => ({ manifest: new Map<string, string>() }) });
  return {
    options,
    connectionId: options.connection_id ?? mintOpaqueId(),
    sessions: new SessionManager(),
    backendRequests: new BackendRequestLimiter(options.backend_timeout_ms),
    freshness,
    generationScheduler: options.generation_scheduler ?? new ProjectGenerationScheduler(freshness),
    rootAccess: new RootAccessGate(options.projectRoot, options.adapters ?? [], options.now),
    state: {
      refreshGeneration: 0,
      viewHistory: [],
      discovery: options.projectRoot ? createDiscoveryPipeline(options.projectRoot) : undefined,
      landmarks: options.landmarks ?? landmarksNotReady(),
    },
  };
}
