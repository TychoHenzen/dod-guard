import {
  type CodeExplorerError,
  codeExplorerError,
} from "../navigation/error.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { handleFocus } from "./focus-action.js";
import { handleFollow } from "./follow-action.js";
import { handleHistory } from "./history-action.js";
import { handleSearch } from "./search-action.js";
import type { ServerActionContext } from "./action-context.js";
import type { PerformCallRequest } from "./server-refresh.js";
import { requestFreshness } from "./server-refresh.js";
import { handleStatus } from "./status-action.js";

async function dispatchAction(
  context: ServerActionContext,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const { runtime, name, arguments_, freshness } = context;
  const handlers = {
    code_focus: () => handleFocus(runtime, arguments_, freshness),
    code_follow: () => handleFollow(runtime, arguments_, freshness),
    code_history: () => handleHistory(runtime, arguments_, freshness),
  };
  const handler = handlers[name as keyof typeof handlers];
  if (handler) {
    const result = await handler();
    if (result) return result;
  }
  if (name === "code_search" && runtime.state.discovery)
    return handleSearch(runtime, arguments_, freshness);
  return handleStatus(context);
}

export async function performCall(
  request: PerformCallRequest,
): Promise<CodeExplorerEnvelope | CodeExplorerError> {
  const { runtime, name } = request;
  const rootStatus = await runtime.rootAccess.check();
  if (name !== "code_status" && rootStatus.state !== "ready")
    return codeExplorerError(rootStatus.state);
  const freshness = await requestFreshness(request);
  return dispatchAction({
    runtime,
    name,
    arguments_: request.arguments_,
    freshness,
    rootStatus,
  });
}
