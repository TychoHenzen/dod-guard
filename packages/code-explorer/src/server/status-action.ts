import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import { createBackendStatusReport, type ProjectRoot, type RootAccessGate } from "../semantic/api/public-api.js";
import { createEnvelope, type CodeExplorerEnvelope } from "./envelope.js";
import type { ToolName } from "./tool-name.js";
import { nativeWorkspaceStatus } from "./workspace-status.js";
import type { ServerRuntime } from "./server-runtime.js";

export function handleStatus(
  runtime: ServerRuntime,
  name: ToolName,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
  rootStatus: Awaited<ReturnType<RootAccessGate["check"]>>,
): CodeExplorerEnvelope {
  const backendStatus =
    name === "code_status"
      ? {
          backend_status: createBackendStatusReport(runtime.options.adapters ?? []),
          sensitive_paths_excluded: runtime.options.sensitive_paths_excluded ?? 0,
          project_root: ".",
          current_generation: freshness.current_generation,
          pending_generation: freshness.pending_generation,
          workspace_state: freshness.state,
          pending_analysis: freshness.pending_generation !== null,
          root_access: rootStatus.state,
          restart_required: rootStatus.restart_required,
          ...(runtime.options.workspace_status?.() ?? nativeWorkspaceStatus(runtime.options.projectRoot)),
          ...runtime.state.discovery?.status(),
        }
      : {};
  const state =
    name === "code_status" && rootStatus.state !== "ready"
      ? "degraded"
      : name === "code_status" && arguments_.action === "refresh" && freshness.state === "ready"
        ? "refreshed"
        : freshness.state === "refreshing" || freshness.state === "degraded" || freshness.state === "refresh_failed"
          ? freshness.state
          : "ready";
  return createEnvelope(freshness, state, backendStatus);
}
