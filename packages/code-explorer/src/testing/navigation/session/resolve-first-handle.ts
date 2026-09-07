import type { FocusView } from "../../../navigation/focus-view.js";
import type { SessionManager } from "../../../navigation/session.js";

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
