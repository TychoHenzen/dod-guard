import type { LandmarkDiscovery } from "../discovery/landmarks.js";
import type { DiscoveryPipeline } from "../discovery/pipeline.js";
import type * as generation from "../freshness/project-generation-scheduler.js";
import { WorkspaceFreshness } from "../freshness/workspace-freshness.js";
import { BackendRequestLimiter } from "../navigation/resource-limits.js";
import { SessionManager } from "../navigation/session.js";
import type { RootAccessGate } from "../semantic/api/public-api.js";
import type { ServerOptions } from "./server-options.js";

type ProjectGenerationScheduler = generation.ProjectGenerationScheduler;

export type ServerRuntime = {
  options: ServerOptions;
  connectionId: string;
  sessions: SessionManager;
  backendRequests: BackendRequestLimiter;
  freshness: WorkspaceFreshness;
  generationScheduler: ProjectGenerationScheduler;
  rootAccess: RootAccessGate;
  state: {
    refreshGeneration: number;
    viewHistory: string[];
    freshnessStarted?: Promise<void>;
    discovery?: DiscoveryPipeline;
    landmarks?: LandmarkDiscovery;
  };
};
