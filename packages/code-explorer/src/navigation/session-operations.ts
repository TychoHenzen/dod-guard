import { mintOpaqueId } from "./opaque-id.js";
import {
  MAX_RETAINED_VIEW_BODY_BYTES,
  MAX_SESSIONS,
} from "./session-limits.js";
import type { SessionRuntime } from "./session-runtime.js";
import { deleteSession, expireIdle } from "./session-views.js";

export { executeSession } from "./session-requests.js";
export type { SessionRuntime } from "./session-runtime.js";
export { addView, resolveHandle } from "./session-view-actions.js";
export {
  history,
  historyPosition,
  recent,
  restore,
} from "./session-views.js";

export function newSessionRuntime(
  maxRetainedBodyBytes = MAX_RETAINED_VIEW_BODY_BYTES,
): SessionRuntime {
  return {
    sessions: new Map(),
    maxRetainedBodyBytes,
    retainedBodyBytes: 0,
    queuedRequests: 0,
  };
}

export function tryStart(
  runtime: SessionRuntime,
  connectionId: string,
  now: number,
): string | undefined {
  expireIdle(runtime, now);
  if (runtime.sessions.size >= MAX_SESSIONS) return undefined;
  const sessionId = mintOpaqueId();
  runtime.sessions.set(sessionId, {
    connectionId,
    queue: Promise.resolve(),
    requests: new Map(),
    views: new Map(),
    viewHistory: [],
    historyPosition: -1,
    staleViews: new Set(),
    lastAcceptedAt: now,
    queuedRequests: 0,
  });
  return sessionId;
}

export function closeConnection(
  runtime: SessionRuntime,
  connectionId: string,
): void {
  for (const [sessionId, session] of runtime.sessions) {
    if (session.connectionId === connectionId)
      deleteSession(runtime, sessionId, session);
  }
}
