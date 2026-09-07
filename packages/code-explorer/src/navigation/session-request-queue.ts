import type { RetainedRequest } from "./retained-request.js";
import {
  MAX_QUEUED_REQUESTS,
  MAX_RETAINED_REQUESTS,
  REQUEST_RETENTION_MS,
} from "./session-limits.js";
import type { SessionResult } from "./session-result.js";
import type { SessionRuntime } from "./session-runtime.js";
import type { Session } from "./session-state.js";

export function queueRequest<T>(
  runtime: SessionRuntime,
  session: Session,
  options: { requestId: string; operation: () => Promise<T>; now: number },
  fingerprint: string,
): SessionResult<T> {
  session.lastAcceptedAt = options.now;
  session.queuedRequests += 1;
  runtime.queuedRequests += 1;
  const response = session.queue.then(options.operation);
  session.queue = response.then(
    () => undefined,
    () => undefined,
  );
  session.requests.set(options.requestId, {
    fingerprint,
    expiresAt: options.now + REQUEST_RETENTION_MS,
    response,
  });
  void response.then(
    () => releaseQueuedRequest(runtime, session),
    () => releaseQueuedRequest(runtime, session),
  );
  trimRequests(session);
  return { state: "ok", response };
}

export function canQueueRequest(runtime: SessionRuntime): boolean {
  return runtime.queuedRequests < MAX_QUEUED_REQUESTS;
}

function trimRequests(session: Session): void {
  while (session.requests.size > MAX_RETAINED_REQUESTS)
    session.requests.delete(session.requests.keys().next().value as string);
}

function releaseQueuedRequest(runtime: SessionRuntime, session: Session): void {
  if (session.queuedRequests === 0) return;
  session.queuedRequests -= 1;
  runtime.queuedRequests -= 1;
}

export function replayRequest<T>(
  retained: RetainedRequest<T>,
  fingerprint: string,
): SessionResult<T> {
  if (retained.fingerprint !== fingerprint)
    return { state: "request_id_conflict" };
  return { state: "ok", response: retained.response };
}
