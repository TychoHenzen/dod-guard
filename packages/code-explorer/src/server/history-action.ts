import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { CodeExplorerError } from "../navigation/error.js";
import { type CodeExplorerEnvelope, createEnvelope } from "./envelope.js";
import { invalidSession, invalidViewHandle } from "./errors.js";
import { schemas } from "./schemas.js";
import type { ServerRuntime } from "./server-runtime.js";

export function handleHistory(
  runtime: ServerRuntime,
  arguments_: Record<string, unknown>,
  freshness: FreshnessStatus,
): CodeExplorerEnvelope | CodeExplorerError {
  const history = schemas.code_history.parse(arguments_);
  if (history.action === "recent")
    return recentHistory({
      runtime,
      sessionId: history.session_id,
      limit: history.limit,
      freshness,
    });
  return restoreHistory({
    runtime,
    sessionId: history.session_id,
    action: history.action,
    freshness,
  });
}

function recentHistory({
  runtime,
  sessionId,
  limit,
  freshness,
}: {
  runtime: ServerRuntime;
  sessionId: string;
  limit: number | undefined;
  freshness: FreshnessStatus;
}): CodeExplorerEnvelope | CodeExplorerError {
  const recent = runtime.sessions.recent(
    runtime.connectionId,
    sessionId,
    limit ?? 64,
  );
  if (!recent) return invalidSession();
  return createEnvelope(freshness, "ready", { views: recent });
}

function restoreHistory({
  runtime,
  sessionId,
  action,
  freshness,
}: {
  runtime: ServerRuntime;
  sessionId: string;
  action: Exclude<
    ReturnType<typeof schemas.code_history.parse>["action"],
    "recent"
  >;
  freshness: FreshnessStatus;
}): CodeExplorerEnvelope | CodeExplorerError {
  const restored = runtime.sessions.restore(
    runtime.connectionId,
    sessionId,
    action,
  );
  if (!restored) return invalidViewHandle();
  return createEnvelope(freshness, "ready", {
    ...restored,
    history_position: runtime.sessions.historyPosition(
      runtime.connectionId,
      sessionId,
    ) ?? 0,
    stale: restored.project_generation !== freshness.current_generation,
  });
}
