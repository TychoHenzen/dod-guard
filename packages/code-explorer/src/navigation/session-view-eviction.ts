import type { OldestEviction } from "./oldest-eviction.js";
import type { Session } from "./session-state.js";
import { MAX_RETAINED_VIEWS, SESSION_IDLE_MS } from "./session-limits.js";
import type { SessionRuntime } from "./session-runtime.js";

export function expireIdle(runtime: SessionRuntime, now: number): void {
  for (const [sessionId, session] of runtime.sessions)
    if (now - session.lastAcceptedAt >= SESSION_IDLE_MS)
      deleteSession(runtime, sessionId, session);
}

export function deleteSession(
  runtime: SessionRuntime,
  sessionId: string,
  session: Session,
): void {
  for (const viewId of session.views.keys())
    discardView(runtime, session, viewId);
  runtime.queuedRequests -= session.queuedRequests;
  runtime.sessions.delete(sessionId);
}

export function evictViews(runtime: SessionRuntime, session: Session): void {
  while (session.views.size > MAX_RETAINED_VIEWS) {
    const viewIndex = session.viewHistory.findIndex(
      (_, index) => index !== session.historyPosition,
    );
    if (viewIndex < 0) return;
    const [viewId] = session.viewHistory.splice(viewIndex, 1);
    discardView(runtime, session, viewId);
    if (viewIndex < session.historyPosition) session.historyPosition -= 1;
  }
}

export function discardView(
  runtime: SessionRuntime,
  session: Session,
  viewId: string,
): void {
  const view = session.views.get(viewId);
  if (!view || !session.views.delete(viewId)) return;
  runtime.retainedBodyBytes -= view.content.returned_bytes;
  session.staleViews.add(viewId);
}

export function makeViewCapacity(
  runtime: SessionRuntime,
  bytes: number,
): boolean {
  while (runtime.retainedBodyBytes + bytes > runtime.maxRetainedBodyBytes) {
    const candidate = oldestEvictableView(runtime);
    if (!candidate) return false;
    candidate.session.viewHistory.splice(candidate.index, 1);
    discardView(runtime, candidate.session, candidate.viewId);
    if (candidate.index < candidate.session.historyPosition)
      candidate.session.historyPosition -= 1;
  }
  return true;
}

function oldestEvictableView(
  runtime: SessionRuntime,
): OldestEviction | undefined {
  for (const session of runtime.sessions.values()) {
    const index = session.viewHistory.findIndex(
      (_, position) => position !== session.historyPosition,
    );
    const viewId = session.viewHistory[index];
    if (index >= 0 && viewId) return { session, viewId, index };
  }
  return undefined;
}
