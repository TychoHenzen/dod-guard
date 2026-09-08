import type { LandmarkDiscovery } from "../discovery/landmarks.js";
import type * as generation from "../freshness/project-generation-scheduler.js";
import type { WorkspaceFreshness } from "../freshness/workspace-freshness.js";
import type {
  LanguageAdapter,
  ProjectRoot,
} from "../semantic/api/public-api.js";

type ProjectGenerationScheduler = generation.ProjectGenerationScheduler;

export type ServerOptions = {
  adapters?: readonly LanguageAdapter[];
  projectRoot?: ProjectRoot;
  sensitive_paths_excluded?: number;
  landmarks?: LandmarkDiscovery;
  connection_id?: string;
  now?: () => number;
  backend_timeout_ms?: number;
  freshness?: WorkspaceFreshness;
  generation_scheduler?: ProjectGenerationScheduler;
  rebuild_derived?: () => Promise<
    { landmarks?: LandmarkDiscovery } | undefined
  >;
  workspace_status?: () => Record<string, unknown>;
};
