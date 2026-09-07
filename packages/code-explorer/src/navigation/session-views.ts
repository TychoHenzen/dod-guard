import type { FocusView } from "./focus-view-type.js";
import { ownedSession } from "./session-owner.js";
import type { SessionRuntime } from "./session-runtime.js";
import type { Session } from "./session-state.js";

export type { SessionRuntime } from "./session-runtime.js";

export {
  deleteSession,
  discardView,
  evictViews,
  expireIdle,
  makeViewCapacity,
} from "./session-view-eviction.js";

export function history(
  runtime: SessionRuntime,
  connectionId: string,
  sessionId: string,
): readonly string[] | undefined {
  return ownedSession(runtime, connectionId, sessionId)?.viewHistory;
}

export function restore(options: {
  runtime: SessionRuntime;
  connectionId: string;
  sessionId: string;
  direction: "back" | "forward";
}): FocusView | undefined {
  const session = ownedSession(
    options.runtime,
    options.connectionId,
    options.sessionId,
  );
  if (!session) return undefined;
  const next =
    session.historyPosition + (options.direction === "back" ? -1 : 1);
  const viewId = session.viewHistory[next];
  if (!viewId) return undefined;
  session.historyPosition = next;
  return session.views.get(viewId);
}

export function recent(options: {
  runtime: SessionRuntime;
  connectionId: string;
  sessionId: string;
  limit: number;
}): readonly FocusView[] | undefined {
  const session = ownedSession(
    options.runtime,
    options.connectionId,
    options.sessionId,
  );
  if (!session) return undefined;
  return session.viewHistory
    .slice(Math.max(0, session.viewHistory.length - options.limit))
    .reverse()
    .flatMap((viewId) => {
      const view = session.views.get(viewId);
      return view ? [view] : [];
    });
}

export function historyPosition(
  runtime: SessionRuntime,
  connectionId: string,
  sessionId: string,
): number | undefined {
  const session = ownedSession(runtime, connectionId, sessionId);
  return session ? session.historyPosition + 1 : undefined;
}
