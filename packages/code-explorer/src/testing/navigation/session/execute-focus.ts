import type { SessionManager } from "../../../navigation/session.js";

export function executeFocus<T>(
  sessions: SessionManager,
  options: {
    sessionId: string;
    requestId: string;
    arguments: Record<string, unknown>;
    operation: () => Promise<T>;
    now?: number;
  },
) {
  return sessions.execute(
    "connection",
    options.sessionId,
    options.requestId,
    "code_focus",
    options.arguments,
    options.operation,
    options.now,
  );
}
