import {
  type CodeExplorerError,
  codeExplorerError,
} from "../navigation/error.js";
import { invalidViewHandle, staleView } from "./errors.js";
import type { ServerRuntime } from "./server-runtime.js";

export function resolveFollowTarget({
  runtime,
  sessionId,
  viewId,
  handle,
  generation,
}: {
  runtime: ServerRuntime;
  sessionId: string;
  viewId: string;
  handle: string;
  generation: number;
}): { symbolId: string } | { error: CodeExplorerError } {
  const resolved = runtime.sessions.resolveHandle(
    runtime.connectionId,
    sessionId,
    viewId,
    handle,
    generation,
  );
  if (resolved.state === "stale_view") {
    if (resolved.viewGeneration === undefined)
      return { error: staleView() };
    return {
      error: codeExplorerError("stale_view", {
        view_generation: resolved.viewGeneration,
        current_generation: resolved.currentGeneration ?? generation,
      }),
    };
  }
  if (resolved.state !== "ok") return { error: invalidViewHandle() };
  return { symbolId: resolved.symbolId };
}
