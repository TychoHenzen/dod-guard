import type { CodeExplorerError } from "../navigation/error.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { createEnvelope } from "./envelope.js";
import {
  invalidSession,
  normalizeBackendFailure,
  projectCapacity,
  requestIdConflict,
} from "./errors.js";
import type { ServerRuntime } from "./server-runtime.js";
import type { ToolName } from "./tool-name.js";

const sessionErrors = {
  invalid_session: invalidSession,
  request_id_conflict: requestIdConflict,
  project_capacity: projectCapacity,
};

function sessionError(
  state: Exclude<
    ReturnType<ServerRuntime["sessions"]["execute"]>["state"],
    "ok"
  >,
): CodeExplorerError {
  return (
    sessionErrors[state as keyof typeof sessionErrors]?.() ??
    invalidSession()
  );
}

export async function startSession(
  runtime: ServerRuntime,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const sessionId = runtime.sessions.tryStart(
    runtime.connectionId,
    runtime.options.now?.(),
  );
  if (!sessionId) return projectCapacity();
  const rootStatus = await runtime.rootAccess.check();
  return createEnvelope(
    { current_generation: 0, pending_generation: null } as never,
    rootStatus.state === "ready" ? "ready" : "degraded",
    {
      session_id: sessionId,
      project_root: ".",
      root_access: rootStatus.state,
      restart_required: rootStatus.restart_required,
    },
  );
}

export async function executeInSession(
  runtime: ServerRuntime,
  request: {
    name: ToolName;
    arguments_: Record<string, unknown>;
    sessionId: string;
    requestId: string;
    perform: () => Promise<CodeExplorerEnvelope | CodeExplorerError>;
  },
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const execution = runtime.sessions.execute(
    runtime.connectionId,
    request.sessionId,
    request.requestId,
    request.name,
    request.arguments_,
    request.perform,
    runtime.options.now?.(),
  );
  if (execution.state !== "ok") return sessionError(execution.state);
  return execution.response.catch(normalizeBackendFailure);
}
