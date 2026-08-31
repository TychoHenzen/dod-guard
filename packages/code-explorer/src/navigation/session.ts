import { type FocusView, mintOpaqueId } from "./focus-view.js";

export const REQUEST_RETENTION_MS = 5 * 60 * 1000;
const MAX_RETAINED_REQUESTS = 64;

type RetainedRequest<T> = { fingerprint: string; expiresAt: number; response: Promise<T> };
type Session = {
  connectionId: string;
  queue: Promise<void>;
  requests: Map<string, RetainedRequest<unknown>>;
  views: Map<string, FocusView>;
  viewHistory: string[];
};

export type SessionResult<T> =
  | { state: "ok"; response: Promise<T> }
  | { state: "invalid_session" | "request_id_conflict" };

/** Connection-local navigation state. It deliberately has no process-global current symbol. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  start(connectionId: string): string {
    const sessionId = mintOpaqueId();
    this.sessions.set(sessionId, {
      connectionId,
      queue: Promise.resolve(),
      requests: new Map(),
      views: new Map(),
      viewHistory: [],
    });
    return sessionId;
  }

  closeConnection(connectionId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.connectionId === connectionId) this.sessions.delete(sessionId);
    }
  }

  execute<T>(
    connectionId: string,
    sessionId: string,
    requestId: string,
    toolName: string,
    arguments_: Record<string, unknown>,
    operation: () => Promise<T>,
    now = Date.now(),
  ): SessionResult<T> {
    const session = this.sessions.get(sessionId);
    if (!session || session.connectionId !== connectionId) return { state: "invalid_session" };
    this.expireRequests(session, now);
    const fingerprint = canonicalFingerprint(toolName, arguments_);
    const retained = session.requests.get(requestId) as RetainedRequest<T> | undefined;
    if (retained) {
      if (retained.fingerprint !== fingerprint) return { state: "request_id_conflict" };
      return { state: "ok", response: retained.response };
    }
    const response = session.queue.then(operation);
    session.queue = response.then(
      () => undefined,
      () => undefined,
    );
    session.requests.set(requestId, { fingerprint, expiresAt: now + REQUEST_RETENTION_MS, response });
    while (session.requests.size > MAX_RETAINED_REQUESTS)
      session.requests.delete(session.requests.keys().next().value as string);
    return { state: "ok", response };
  }

  addView(connectionId: string, sessionId: string, view: FocusView): boolean {
    const session = this.ownedSession(connectionId, sessionId);
    if (!session) return false;
    session.views.set(view.view_id, view);
    session.viewHistory.push(view.view_id);
    return true;
  }

  resolveHandle(connectionId: string, sessionId: string, viewId: string, handle: string): string | undefined {
    const view = this.ownedSession(connectionId, sessionId)?.views.get(viewId);
    return view?.handles.find((candidate) => candidate.handle === handle)?.symbol_id;
  }

  history(connectionId: string, sessionId: string): readonly string[] | undefined {
    return this.ownedSession(connectionId, sessionId)?.viewHistory;
  }

  private ownedSession(connectionId: string, sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session?.connectionId === connectionId ? session : undefined;
  }

  private expireRequests(session: Session, now: number): void {
    for (const [requestId, entry] of session.requests) if (entry.expiresAt <= now) session.requests.delete(requestId);
  }
}

export function canonicalFingerprint(toolName: string, arguments_: Record<string, unknown>): string {
  const { request_id: _requestId, ...remaining } = arguments_;
  return JSON.stringify({ tool: toolName, arguments: canonicalize(remaining) });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
