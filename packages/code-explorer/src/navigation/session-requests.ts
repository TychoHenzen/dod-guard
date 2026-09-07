import type { RetainedRequest } from "./retained-request.js";
import type { Session } from "./session-state.js";
import type { SessionResult } from "./session-result.js";
import { canonicalFingerprint } from "./session-fingerprint.js";
import { ownedSession } from "./session-owner.js";
import {
  canQueueRequest,
  queueRequest,
  replayRequest,
} from "./session-request-queue.js";
import { expireIdle } from "./session-views.js";
import type { SessionRuntime } from "./session-runtime.js";

export function executeSession<T>(
  runtime: SessionRuntime,
  options: {
    connectionId: string;
    sessionId: string;
    requestId: string;
    toolName: string;
    arguments_: Record<string, unknown>;
    operation: () => Promise<T>;
    now: number;
  },
): SessionResult<T> {
  expireIdle(runtime, options.now);
  const session = ownedSession(
    runtime,
    options.connectionId,
    options.sessionId,
  );
  if (!session) return { state: "invalid_session" };
  return processSessionRequest(runtime, session, options);
}

function processSessionRequest<T>(
  runtime: SessionRuntime,
  session: Session,
  options: {
    requestId: string;
    toolName: string;
    arguments_: Record<string, unknown>;
    operation: () => Promise<T>;
    now: number;
  },
): SessionResult<T> {
  expireRequests(session, options.now);
  const fingerprint = canonicalFingerprint(
    options.toolName,
    options.arguments_,
  );
  const retained = session.requests.get(options.requestId) as
    | RetainedRequest<T>
    | undefined;
  if (retained) return replayRequest(retained, fingerprint);
  if (!canQueueRequest(runtime))
    return { state: "project_capacity" };
  return queueRequest(runtime, session, options, fingerprint);
}

function expireRequests(session: Session, now: number): void {
  for (const [requestId, entry] of session.requests)
    if (entry.expiresAt <= now) session.requests.delete(requestId);
}
