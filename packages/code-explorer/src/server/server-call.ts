import { Buffer } from "node:buffer";
import { createEnvelope } from "./envelope.js";
import { invalidRequest, invalidSession, limitedResource, projectCapacity, requestIdConflict, unknownTool, normalizeBackendFailure } from "./errors.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { performCall } from "./perform-call.js";
import type { ServerRuntime } from "./server-runtime.js";
import { schemas } from "./schemas.js";
import { isToolName } from "./tool-name.js";
import { validateResourceLimits } from "../navigation/resource-limits.js";
import type { CodeExplorerError } from "../navigation/error.js";

function hasValidRequestId(value: string): boolean {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= 16 && bytes <= 128;
}

export function createServerCall(runtime: ServerRuntime) {
  const ensureFreshness = () => (runtime.state.freshnessStarted ??= runtime.freshness.start());
  return async function call(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CodeExplorerEnvelope | CodeExplorerError> {
    if (!isToolName(name)) return unknownTool();
    const limit = validateResourceLimits(name, arguments_);
    if (limit) return limitedResource(limit);
    const parsed = schemas[name].safeParse(arguments_);
    if (!parsed.success) return invalidRequest();
    if (!(name === "code_status" && arguments_.action === "start_session")) await ensureFreshness();
    if (name === "code_status" && arguments_.action === "start_session") {
      const sessionId = runtime.sessions.tryStart(runtime.connectionId, runtime.options.now?.());
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
    const parsedArguments = parsed.data as Record<string, unknown>;
    const sessionId = typeof parsedArguments.session_id === "string" ? parsedArguments.session_id : undefined;
    const requestId = typeof parsedArguments.request_id === "string" ? parsedArguments.request_id : undefined;
    const stateChanging =
      name === "code_focus" ||
      name === "code_follow" ||
      name === "code_history" ||
      (name === "code_status" && arguments_.action === "refresh");
    if (stateChanging && !(requestId && hasValidRequestId(requestId) && sessionId)) return invalidRequest();
    const perform = () => performCall(runtime, name, parsedArguments, sessionId);
    if (stateChanging && sessionId && requestId) {
      const execution = runtime.sessions.execute(
        runtime.connectionId,
        sessionId,
        requestId,
        name,
        parsedArguments,
        perform,
        runtime.options.now?.(),
      );
      if (execution.state === "invalid_session") return invalidSession();
      if (execution.state === "request_id_conflict") return requestIdConflict();
      if (execution.state === "project_capacity") return projectCapacity();
      if (execution.state === "ok") return execution.response.catch(normalizeBackendFailure);
      return invalidSession();
    }
    return perform().catch(normalizeBackendFailure);
  };
}
