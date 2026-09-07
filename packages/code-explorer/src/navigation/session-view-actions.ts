import type { AddViewResult } from "./add-view-result.js";
import type { FocusView } from "./focus-view-type.js";
import {
  discardView,
  evictViews,
  makeViewCapacity,
} from "./session-view-eviction.js";
import { ownedSession } from "./session-owner.js";
import type { SessionRuntime } from "./session-runtime.js";

export function addView(options: {
  runtime: SessionRuntime;
  connectionId: string;
  sessionId: string;
  view: FocusView;
}): AddViewResult {
  const session = ownedSession(
    options.runtime,
    options.connectionId,
    options.sessionId,
  );
  if (!session) return "invalid_session";
  if (!makeViewCapacity(options.runtime, options.view.content.returned_bytes))
    return "project_capacity";
  const abandoned = session.viewHistory.splice(session.historyPosition + 1);
  for (const viewId of abandoned) discardView(options.runtime, session, viewId);
  session.views.set(options.view.view_id, options.view);
  options.runtime.retainedBodyBytes += options.view.content.returned_bytes;
  session.viewHistory.push(options.view.view_id);
  session.historyPosition = session.viewHistory.length - 1;
  evictViews(options.runtime, session);
  return "ok";
}

export function resolveHandle(
  runtime: SessionRuntime,
  options: {
    connectionId: string;
    sessionId: string;
    viewId: string;
    handle: string;
    currentGeneration: number;
  },
):
  | { state: "ok"; symbolId: string }
  | { state: "invalid_view_handle" }
  | {
      state: "stale_view";
      viewGeneration?: number;
      currentGeneration?: number;
    } {
  const session = ownedSession(
    runtime,
    options.connectionId,
    options.sessionId,
  );
  if (!session) return { state: "invalid_view_handle" };
  if (session.staleViews.has(options.viewId)) return { state: "stale_view" };
  const view = session.views.get(options.viewId);
  if (view && view.project_generation !== options.currentGeneration)
    return {
      state: "stale_view",
      viewGeneration: view.project_generation,
      currentGeneration: options.currentGeneration,
    };
  const symbolId = view?.handles.find(
    (candidate) => candidate.handle === options.handle,
  )?.symbol_id;
  return symbolId
    ? { state: "ok", symbolId }
    : { state: "invalid_view_handle" };
}
