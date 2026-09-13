import { createBackendStatusReport } from "../semantic/api/public-api.js";
import type { ServerActionContext } from "./action-context.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { readWorkspaceStatus } from "./workspace-status.js";

function backendStatus(runtime: ServerActionContext["runtime"]) {
  return createBackendStatusReport(runtime.options.adapters ?? []);
}

function sensitivePathsExcluded(runtime: ServerActionContext["runtime"]) {
  return runtime.options.sensitive_paths_excluded ?? 0;
}

function discoveryStatus(runtime: ServerActionContext["runtime"]) {
  return runtime.state.discovery?.status() ?? {};
}

export function statusData(
  context: ServerActionContext,
): Record<string, unknown> {
  const { runtime, name, freshness, rootStatus } = context;
  if (name !== "code_status") return {};
  return {
    backend_status: backendStatus(runtime),
    sensitive_paths_excluded: sensitivePathsExcluded(runtime),
    project_root: ".",
    current_generation: freshness.current_generation,
    pending_generation: freshness.pending_generation,
    workspace_state: freshness.state,
    pending_analysis: freshness.pending_generation !== null,
    root_access: rootStatus.state,
    restart_required: rootStatus.restart_required,
    ...readWorkspaceStatus(runtime),
    ...discoveryStatus(runtime),
  };
}

function hasUnavailableRoot(context: ServerActionContext): boolean {
  return context.name === "code_status" && context.rootStatus.state !== "ready";
}

function refreshCompleted(context: ServerActionContext): boolean {
  return (
    context.name === "code_status" &&
    context.arguments_.action === "refresh" &&
    context.freshness.state === "ready"
  );
}

function intermediateEnvelopeState(
  state: ServerActionContext["freshness"]["state"],
): CodeExplorerEnvelope["state"] | undefined {
  if (
    state === "refreshing" ||
    state === "degraded" ||
    state === "refresh_failed"
  )
    return state;
}

export function statusEnvelopeState(
  context: ServerActionContext,
): CodeExplorerEnvelope["state"] {
  if (hasUnavailableRoot(context)) return "degraded";
  if (refreshCompleted(context)) return "refreshed";
  const intermediate = intermediateEnvelopeState(context.freshness.state);
  if (intermediate) return intermediate;
  return "ready";
}
