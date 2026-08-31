import { Buffer } from "node:buffer";

export const MAX_QUERY_CODE_POINTS = 1024;
export const MAX_FILTER_VALUES = 32;
export const MAX_FILTER_VALUE_BYTES = 256;
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_CANDIDATES = 200;
export const MAX_BODY_BYTES = 128 * 1024;
export const DEFAULT_BACKEND_TIMEOUT_MS = 10_000;
export const MAX_BACKEND_TIMEOUT_MS = 60_000;
const MAX_SESSION_BACKEND_REQUESTS = 4;
const MAX_PROJECT_BACKEND_REQUESTS = 8;

export type ResourceLimit = { field: string; limit: number; actual: number };

export class BackendTimeoutError extends Error {
  constructor() {
    super("backend_timeout");
  }
}

export class BackendCapacityError extends Error {
  constructor() {
    super("resource_limit");
  }
}

/** Rejects oversized wire inputs before schemas, filesystem access, or backend work. */
export function validateResourceLimits(name: string, arguments_: Record<string, unknown>): ResourceLimit | undefined {
  const requestBytes = Buffer.byteLength(JSON.stringify(arguments_), "utf8");
  if (requestBytes > MAX_REQUEST_BYTES) return { field: "request", limit: MAX_REQUEST_BYTES, actual: requestBytes };
  if (name === "code_search" && typeof arguments_.query === "string") {
    const codePoints = Array.from(arguments_.query).length;
    if (codePoints > MAX_QUERY_CODE_POINTS) return { field: "query", limit: MAX_QUERY_CODE_POINTS, actual: codePoints };
  }
  const filters = [arguments_.path_globs, arguments_.languages, arguments_.kinds].flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  if (filters.length > MAX_FILTER_VALUES) return { field: "filters", limit: MAX_FILTER_VALUES, actual: filters.length };
  for (const value of filters) {
    if (typeof value !== "string") continue;
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > MAX_FILTER_VALUE_BYTES) return { field: "filter_value", limit: MAX_FILTER_VALUE_BYTES, actual: bytes };
  }
  if (
    (name === "code_search" || name === "code_follow") &&
    typeof arguments_.limit === "number" &&
    arguments_.limit > MAX_CANDIDATES
  )
    return { field: "limit", limit: MAX_CANDIDATES, actual: arguments_.limit };
  if (
    name === "code_focus" &&
    typeof arguments_.body_limit_bytes === "number" &&
    arguments_.body_limit_bytes > MAX_BODY_BYTES
  )
    return { field: "body_limit_bytes", limit: MAX_BODY_BYTES, actual: arguments_.body_limit_bytes };
  return undefined;
}

/** Tracks bounded in-flight backend work and abandons calls that exceed the configured timeout. */
export class BackendRequestLimiter {
  private projectActive = 0;
  private readonly sessionActive = new Map<string, number>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_BACKEND_TIMEOUT_MS) {
    this.timeoutMs = Math.min(Math.max(timeoutMs, 1), MAX_BACKEND_TIMEOUT_MS);
  }

  async run<T>(sessionId: string | undefined, operation: () => Promise<T>): Promise<T> {
    const sessionActive = sessionId ? (this.sessionActive.get(sessionId) ?? 0) : 0;
    if (this.projectActive >= MAX_PROJECT_BACKEND_REQUESTS || sessionActive >= MAX_SESSION_BACKEND_REQUESTS)
      throw new BackendCapacityError();
    this.projectActive += 1;
    if (sessionId) this.sessionActive.set(sessionId, sessionActive + 1);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new BackendTimeoutError()), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      this.projectActive -= 1;
      if (sessionId) {
        const remaining = (this.sessionActive.get(sessionId) ?? 1) - 1;
        if (remaining === 0) this.sessionActive.delete(sessionId);
        else this.sessionActive.set(sessionId, remaining);
      }
    }
  }
}
