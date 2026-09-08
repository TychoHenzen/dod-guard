import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { FocusView } from "../navigation/focus-view.js";

export type CodeExplorerEnvelope = {
  schema_version: 1;
  project_id: string;
  project_generation: number;
  pending_generation: number | null;
  state:
    | "ready"
    | "refreshed"
    | "refreshing"
    | "degraded"
    | "refresh_failed"
    | "unavailable_relation"
    | "landmarks_not_ready";
  data: Record<string, unknown>;
};

export function readyViewEnvelope(
  view: FocusView,
  freshness: FreshnessStatus,
  historyPosition: number,
): CodeExplorerEnvelope {
  return createEnvelope(freshness, "ready", {
    ...view,
    history_position: historyPosition,
  });
}

export function createEnvelope(
  freshness: FreshnessStatus,
  state: CodeExplorerEnvelope["state"],
  data: Record<string, unknown>,
): CodeExplorerEnvelope {
  return {
    schema_version: 1,
    project_id: "project",
    project_generation: freshness.current_generation,
    pending_generation: freshness.pending_generation,
    state,
    data,
  };
}
