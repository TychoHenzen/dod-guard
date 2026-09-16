import type { FocusView } from "../../../../src/navigation/focus-view.js";
import type { SessionManager } from "../../../../src/navigation/session.js";

export function resolveFirstHandle(
  sessions: SessionManager,
  sessionId: string,
  view: FocusView,
) {
  return sessions.resolveHandle(
    "connection",
    sessionId,
    view.view_id,
    view.handles[0].handle,
  );
}
