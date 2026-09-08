import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { CodeExplorerError } from "../navigation/error.js";
import { createEnvelope, type CodeExplorerEnvelope } from "./envelope.js";
import { invalidSession, invalidViewHandle } from "./errors.js";
import type { ServerRuntime } from "./server-runtime.js";
import { schemas } from "./schemas.js";

export function handleHistory(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): CodeExplorerEnvelope | CodeExplorerError {
  const history = schemas.code_history.parse(arguments_);
  if (history.action === "recent") {
    const recent = runtime.sessions.recent(
      runtime.connectionId,
      history.session_id,
      history.limit ?? 64,
    );
    if (!recent) return invalidSession();
    return createEnvelope(freshness, "ready", { views: recent });
  }
  const restored = runtime.sessions.restore(
    runtime.connectionId,
    history.session_id,
    history.action,
  );
  if (!restored) return invalidViewHandle();
  return createEnvelope(freshness, "ready", {
    ...restored,
    history_position:
      runtime.sessions.historyPosition(
        runtime.connectionId,
        history.session_id,
      ) ?? 0,
    stale: restored.project_generation !== freshness.current_generation,
  });
}
