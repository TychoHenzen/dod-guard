import type { Session } from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";

export function ownedSession(
  runtime: SessionRuntime,
  connectionId: string,
  sessionId: string,
): Session | undefined {
  const session = runtime.sessions.get(sessionId);
  return session?.connectionId === connectionId ? session : undefined;
}
