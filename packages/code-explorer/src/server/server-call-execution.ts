import type { CodeExplorerError } from "../navigation/error.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { invalidRequest, normalizeBackendFailure } from "./errors.js";
import { performCall } from "./perform-call.js";
import type { ServerRuntime } from "./server-runtime.js";
import { executeInSession, startSession } from "./server-call-session.js";
import {
  hasValidRequestId,
  isStartSessionCall,
  isStateChangingCall,
  stringArgument,
} from "./server-call-validation.js";
import type { ToolName } from "./tool-name.js";

function ensureFreshness(runtime: ServerRuntime): Promise<void> {
  return (runtime.state.freshnessStarted ??= runtime.freshness.start());
}

function sessionRequest(arguments_: Record<string, unknown>) {
  const sessionId = stringArgument(arguments_, "session_id");
  const requestId = stringArgument(arguments_, "request_id");
  if (!sessionId || !requestId || !hasValidRequestId(requestId)) return;
  return { sessionId, requestId };
}

async function performValidatedCall(
  runtime: ServerRuntime,
  name: ToolName,
  arguments_: Record<string, unknown>,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const sessionId = stringArgument(arguments_, "session_id");
  const perform = () =>
    performCall({ runtime, name, arguments_, sessionId });
  if (!isStateChangingCall(name, arguments_))
    return perform().catch(normalizeBackendFailure);
  const request = sessionRequest(arguments_);
  if (!request) return invalidRequest();
  return executeInSession(runtime, {
    name,
    arguments_,
    ...request,
    perform,
  });
}

export async function executeValidatedCall(
  runtime: ServerRuntime,
  name: ToolName,
  arguments_: Record<string, unknown>,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  if (isStartSessionCall(name, arguments_)) return startSession(runtime);
  await ensureFreshness(runtime);
  return performValidatedCall(runtime, name, arguments_);
}
