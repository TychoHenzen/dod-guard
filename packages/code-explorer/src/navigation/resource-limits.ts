import { Buffer } from "node:buffer";
import { BackendCapacityError } from "./backend-capacity-error.js";
import { BackendRequestLimiter } from "./backend-request-limiter.js";
import { BackendTimeoutError } from "./backend-timeout-error.js";
import { filterLimit } from "./resource-filter-limits.js";
import {
  MAX_FILTER_VALUE_BYTES,
  MAX_FILTER_VALUES,
} from "./resource-limit-constants.js";
import type { ResourceLimit } from "./resource-limit.js";

export const MAX_QUERY_CODE_POINTS = 1024;
export {
  MAX_FILTER_VALUE_BYTES,
  MAX_FILTER_VALUES,
} from "./resource-limit-constants.js";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_CANDIDATES = 200;
export const MAX_BODY_BYTES = 128 * 1024;
export {
  DEFAULT_BACKEND_TIMEOUT_MS,
  MAX_BACKEND_TIMEOUT_MS,
} from "./backend-timeout-limits.js";
export type { ResourceLimit } from "./resource-limit.js";
export { BackendCapacityError } from "./backend-capacity-error.js";
export { BackendRequestLimiter } from "./backend-request-limiter.js";
export { BackendTimeoutError } from "./backend-timeout-error.js";

/** Rejects oversized wire inputs before schemas, filesystem access, or backend
 * work.
 */
export function validateResourceLimits(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  const limits = [
    requestLimit(arguments_),
    queryLimit(name, arguments_),
    filterLimit(arguments_),
    candidateLimit(name, arguments_),
    bodyLimit(name, arguments_),
  ];
  return limits.find((limit): limit is ResourceLimit => limit !== undefined);
}

function requestLimit(
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  const actual = Buffer.byteLength(JSON.stringify(arguments_), "utf8");
  if (actual > MAX_REQUEST_BYTES)
    return { field: "request", limit: MAX_REQUEST_BYTES, actual };
  return undefined;
}

function queryLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_search" || typeof arguments_.query !== "string")
    return undefined;
  const actual = Array.from(arguments_.query).length;
  if (actual > MAX_QUERY_CODE_POINTS)
    return { field: "query", limit: MAX_QUERY_CODE_POINTS, actual };
  return undefined;
}

function candidateLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_search" && name !== "code_follow") return undefined;
  if (
    typeof arguments_.limit !== "number" ||
    arguments_.limit <= MAX_CANDIDATES
  )
    return undefined;
  return { field: "limit", limit: MAX_CANDIDATES, actual: arguments_.limit };
}

function bodyLimit(
  name: string,
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  if (name !== "code_focus") return undefined;
  if (
    typeof arguments_.body_limit_bytes !== "number" ||
    arguments_.body_limit_bytes <= MAX_BODY_BYTES
  )
    return undefined;
  return {
    field: "body_limit_bytes",
    limit: MAX_BODY_BYTES,
    actual: arguments_.body_limit_bytes,
  };
}
