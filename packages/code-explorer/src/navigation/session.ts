import { type FocusView, mintOpaqueId } from "./focus-view.js";

export const REQUEST_RETENTION_MS = 5 * 60 * 1000;
const MAX_RETAINED_REQUESTS = 64;
export const MAX_RETAINED_VIEWS = 64;
export const MAX_SESSIONS = 8;
export const MAX_RETAINED_VIEW_BODY_BYTES = 16 * 1024 * 1024;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
const MAX_QUEUED_REQUESTS = 64;

type RetainedRequest<T> = { fingerprint: string; expiresAt: number; response: Promise<T> };
type Session = {
  connectionId: string;
  queue: Promise<void>;
  requests: Map<string, RetainedRequest<unknown>>;
  views: Map<string, FocusView>;
  viewHistory: string[];
  historyPosition: number;
  staleViews: Set<string>;
  lastAcceptedAt: number;
  queuedRequests: number;
};

export type SessionResult<T> =
  | { state: "ok"; response: Promise<T> }
  | { state: "invalid_session" | "request_id_conflict" | "project_capacity" };

export type AddViewResult = "ok" | "invalid_session" | "project_capacity";

export class SessionCapacityError extends Error {
  constructor() {
    super("project_capacity");
  }
}

/** Connection-local navigation state. It deliberately has no process-global current symbol. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly maxRetainedBodyBytes: number;
  private retainedBodyBytes = 0;
  private queuedRequests = 0;

  constructor(options: { maxRetainedBodyBytes?: number } = {}) {
    this.maxRetainedBodyBytes = options.maxRetainedBodyBytes ?? MAX_RETAINED_VIEW_BODY_BYTES;
  }

  start(connectionId: string): string {
    const sessionId = this.tryStart(connectionId);
    if (!sessionId) throw new SessionCapacityError();
    return sessionId;
  }

  tryStart(connectionId: string, now = Date.now()): string | undefined {
    this.expireIdle(now);
    if (this.sessions.size >= MAX_SESSIONS) return undefined;
    const sessionId = mintOpaqueId();
    this.sessions.set(sessionId, {
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

  closeConnection(connectionId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.connectionId === connectionId) this.deleteSession(sessionId, session);
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
    this.expireIdle(now);
    const session = this.sessions.get(sessionId);
    if (!session || session.connectionId !== connectionId) return { state: "invalid_session" };
    this.expireRequests(session, now);
    const fingerprint = canonicalFingerprint(toolName, arguments_);
    const retained = session.requests.get(requestId) as RetainedRequest<T> | undefined;
    if (retained) {
      if (retained.fingerprint !== fingerprint) return { state: "request_id_conflict" };
      return { state: "ok", response: retained.response };
    }
    if (this.queuedRequests >= MAX_QUEUED_REQUESTS) return { state: "project_capacity" };
    session.lastAcceptedAt = now;
    session.queuedRequests += 1;
    this.queuedRequests += 1;
    const response = session.queue.then(operation);
    session.queue = response.then(
      () => undefined,
      () => undefined,
    );
    session.requests.set(requestId, { fingerprint, expiresAt: now + REQUEST_RETENTION_MS, response });
    void response.then(
      () => this.releaseQueuedRequest(session),
      () => this.releaseQueuedRequest(session),
    );
    while (session.requests.size > MAX_RETAINED_REQUESTS)
      session.requests.delete(session.requests.keys().next().value as string);
    return { state: "ok", response };
  }

  addView(connectionId: string, sessionId: string, view: FocusView): AddViewResult {
    const session = this.ownedSession(connectionId, sessionId);
    if (!session) return "invalid_session";
    if (!this.makeViewCapacity(view.content.returned_bytes)) return "project_capacity";
    const abandoned = session.viewHistory.splice(session.historyPosition + 1);
    for (const viewId of abandoned) this.discardView(session, viewId);
    session.views.set(view.view_id, view);
    this.retainedBodyBytes += view.content.returned_bytes;
    session.viewHistory.push(view.view_id);
    session.historyPosition = session.viewHistory.length - 1;
    this.evictViews(session);
    return "ok";
  }

  resolveHandle(
    connectionId: string,
    sessionId: string,
    viewId: string,
    handle: string,
    currentGeneration = 0,
  ):
    | { state: "ok"; symbolId: string }
    | { state: "invalid_view_handle" }
    | { state: "stale_view"; viewGeneration?: number; currentGeneration?: number } {
    const session = this.ownedSession(connectionId, sessionId);
    if (!session) return { state: "invalid_view_handle" };
    if (session.staleViews.has(viewId)) return { state: "stale_view" };
    const view = session.views.get(viewId);
    if (view && view.project_generation !== currentGeneration)
      return { state: "stale_view", viewGeneration: view.project_generation, currentGeneration };
    const symbolId = view?.handles.find((candidate) => candidate.handle === handle)?.symbol_id;
    return symbolId ? { state: "ok", symbolId } : { state: "invalid_view_handle" };
  }

  history(connectionId: string, sessionId: string): readonly string[] | undefined {
    return this.ownedSession(connectionId, sessionId)?.viewHistory;
  }

  restore(connectionId: string, sessionId: string, direction: "back" | "forward"): FocusView | undefined {
    const session = this.ownedSession(connectionId, sessionId);
    if (!session) return undefined;
    const next = session.historyPosition + (direction === "back" ? -1 : 1);
    const viewId = session.viewHistory[next];
    if (!viewId) return undefined;
    session.historyPosition = next;
    return session.views.get(viewId);
  }

  recent(connectionId: string, sessionId: string, limit = MAX_RETAINED_VIEWS): readonly FocusView[] | undefined {
    const session = this.ownedSession(connectionId, sessionId);
    if (!session) return undefined;
    return session.viewHistory
      .slice(Math.max(0, session.viewHistory.length - limit))
      .reverse()
      .flatMap((viewId) => {
        const view = session.views.get(viewId);
        return view ? [view] : [];
      });
  }

  historyPosition(connectionId: string, sessionId: string): number | undefined {
    const session = this.ownedSession(connectionId, sessionId);
    return session ? session.historyPosition + 1 : undefined;
  }

  private ownedSession(connectionId: string, sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session?.connectionId === connectionId ? session : undefined;
  }

  private expireRequests(session: Session, now: number): void {
    for (const [requestId, entry] of session.requests) if (entry.expiresAt <= now) session.requests.delete(requestId);
  }

  private evictViews(session: Session): void {
    while (session.views.size > MAX_RETAINED_VIEWS) {
      const viewIndex = session.viewHistory.findIndex((_, index) => index !== session.historyPosition);
      if (viewIndex < 0) return;
      const [viewId] = session.viewHistory.splice(viewIndex, 1);
      this.discardView(session, viewId);
      if (viewIndex < session.historyPosition) session.historyPosition -= 1;
    }
  }

  private discardView(session: Session, viewId: string): void {
    const view = session.views.get(viewId);
    if (view && session.views.delete(viewId)) {
      this.retainedBodyBytes -= view.content.returned_bytes;
      session.staleViews.add(viewId);
    }
  }

  private makeViewCapacity(bytes: number): boolean {
    while (this.retainedBodyBytes + bytes > this.maxRetainedBodyBytes) {
      const candidate = this.oldestEvictableView();
      if (!candidate) return false;
      const [session, viewId, index] = candidate;
      session.viewHistory.splice(index, 1);
      this.discardView(session, viewId);
      if (index < session.historyPosition) session.historyPosition -= 1;
    }
    return true;
  }

  private oldestEvictableView(): [Session, string, number] | undefined {
    for (const session of this.sessions.values()) {
      const index = session.viewHistory.findIndex((_, position) => position !== session.historyPosition);
      const viewId = session.viewHistory[index];
      if (index >= 0 && viewId) return [session, viewId, index];
    }
    return undefined;
  }

  private expireIdle(now: number): void {
    for (const [sessionId, session] of this.sessions)
      if (now - session.lastAcceptedAt >= SESSION_IDLE_MS) this.deleteSession(sessionId, session);
  }

  private deleteSession(sessionId: string, session: Session): void {
    for (const viewId of session.views.keys()) this.discardView(session, viewId);
    this.queuedRequests -= session.queuedRequests;
    this.sessions.delete(sessionId);
  }

  private releaseQueuedRequest(session: Session): void {
    if (session.queuedRequests === 0) return;
    session.queuedRequests -= 1;
    this.queuedRequests -= 1;
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
