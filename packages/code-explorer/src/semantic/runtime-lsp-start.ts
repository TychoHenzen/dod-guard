import type { InjectedSemanticBackend } from "./language-adapter.js";
import { startRuntimeProcess } from "./runtime-lsp-start-process.js";
import type { RuntimeLspState } from "./runtime-lsp-state.js";

type RuntimeStart = () => Promise<void>;

export function createRuntimeStart(lifecycle: RuntimeLspState): RuntimeStart {
  return () => startRuntime(lifecycle);
}

async function startRuntime(lifecycle: RuntimeLspState): Promise<void> {
  if (lifecycle.refreshRequired) throw new Error("backend_identity_changed");
  if (lifecycle.started) return lifecycle.started;
  lifecycle.started = startFreshRuntime(lifecycle);
  return lifecycle.started;
}

function startFreshRuntime(lifecycle: RuntimeLspState): Promise<void> {
  return startRuntimeProcess(lifecycle)
    .then(() => {
      lifecycle.state = readiness(lifecycle.client?.status().state ?? "failed");
    })
    .catch((error) => recordStartFailure(lifecycle, error));
}

function recordStartFailure(lifecycle: RuntimeLspState, error: unknown) {
  const code = error instanceof Error ? error.message : "backend_failed";
  lifecycle.state = failedState(code);
  lifecycle.refreshRequired ||= code === "backend_identity_changed";
  throw error;
}

function failedState(
  code: string,
): ReturnType<InjectedSemanticBackend["readiness"]> {
  return code === "backend_identity_changed"
    ? { state: "unavailable", failure_code: code }
    : { state: "failed", failure_code: code };
}

function readiness(
  value: "initializing" | "ready" | "failed" | "unavailable",
): ReturnType<InjectedSemanticBackend["readiness"]> {
  if (value === "failed")
    return {
      state: "failed",
      failure_code: "backend_failed",
    };
  if (value === "initializing") return { state: "initializing" };
  if (value === "ready") return { state: "ready" };
  return { state: "unavailable" };
}
